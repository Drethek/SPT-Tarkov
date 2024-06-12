"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LootRankingGenerator = void 0;
const config_json_1 = __importDefault(require("../config/config.json"));
const CommonUtils_1 = require("./CommonUtils");
const verboseLogging = false;
const lootFilePath = `${__dirname}/../db/lootRanking.json`;
class LootRankingGenerator {
    commonUtils;
    databaseTables;
    vfs;
    botWeaponGenerator;
    hashUtil;
    constructor(commonUtils, databaseTables, vfs, botWeaponGenerator, hashUtil) {
        this.commonUtils = commonUtils;
        this.databaseTables = databaseTables;
        this.vfs = vfs;
        this.botWeaponGenerator = botWeaponGenerator;
        this.hashUtil = hashUtil;
    }
    getLootRankingDataFromFile() {
        const rankingDataStr = this.vfs.readFile(lootFilePath);
        return JSON.parse(rankingDataStr);
    }
    generateLootRankingData(sessionId) {
        if (!config_json_1.default.destroy_loot_during_raid.loot_ranking) {
            this.commonUtils.logInfo("Loot ranking is disabled in config.json.");
            return;
        }
        if (this.validLootRankingDataExists()) {
            this.commonUtils.logInfo("Using existing loot ranking data.");
            return;
        }
        this.commonUtils.logInfo("Creating loot ranking data...", true);
        // Create ranking data for each item found in the server database
        const items = {};
        for (const itemID in this.databaseTables.templates.items) {
            if (this.databaseTables.templates.items[itemID]._type === "Node") {
                continue;
            }
            if (this.databaseTables.templates.items[itemID]._props.QuestItem) {
                continue;
            }
            items[this.databaseTables.templates.items[itemID]._id] = this.generateLookRankingForItem(this.databaseTables.templates.items[itemID], sessionId);
        }
        // Generate the file contents
        const rankingData = {
            costPerSlot: config_json_1.default.destroy_loot_during_raid.loot_ranking.weighting.cost_per_slot,
            weight: config_json_1.default.destroy_loot_during_raid.loot_ranking.weighting.weight,
            size: config_json_1.default.destroy_loot_during_raid.loot_ranking.weighting.size,
            gridSize: config_json_1.default.destroy_loot_during_raid.loot_ranking.weighting.gridSize,
            maxDim: config_json_1.default.destroy_loot_during_raid.loot_ranking.weighting.max_dim,
            armorClass: config_json_1.default.destroy_loot_during_raid.loot_ranking.weighting.armor_class,
            parentWeighting: config_json_1.default.destroy_loot_during_raid.loot_ranking.weighting.parents,
            items: items
        };
        const rankingDataStr = JSON.stringify(rankingData);
        this.vfs.writeFile(lootFilePath, rankingDataStr);
        this.commonUtils.logInfo("Creating loot ranking data...done.", true);
    }
    generateLookRankingForItem(item, sessionId) {
        // Get required item properties from the server database
        const cost = this.commonUtils.getMaxItemPrice(item._id);
        let weight = item._props.Weight;
        let size = item._props.Width * item._props.Height;
        let maxDim = Math.max(item._props.Width, item._props.Height);
        // If the item is a weapon, find a suitable assembled version of it
        if (item._props.weapClass !== undefined) {
            // First try to find the most desirable weapon from the traders
            let bestWeaponMatch = this.findBestWeaponMatchfromTraders(item);
            // If the weapon isn't offered by any traders, find the most desirable version in the presets
            if (bestWeaponMatch.length === 0) {
                if (verboseLogging)
                    this.commonUtils.logInfo(`Could not find ${this.commonUtils.getItemName(item._id)} in trader assorts.`);
                bestWeaponMatch = this.findBestWeaponInPresets(item);
            }
            // Ensure a weapon has been generated
            if (bestWeaponMatch.length === 0) {
                this.commonUtils.logError(`Could not generate a weapon for ${this.commonUtils.getItemName(item._id)}`);
            }
            else {
                const [weaponWidth, weaponHeight, weaponWeight] = this.getWeaponProperties(item, bestWeaponMatch);
                if (verboseLogging)
                    this.commonUtils.logInfo(`Found weapon ${this.commonUtils.getItemName(item._id)}: Width=${weaponWidth},Height=${weaponHeight},Weight=${weaponWeight}`);
                weight = weaponWeight;
                size = weaponWidth * weaponHeight;
                maxDim = Math.max(weaponWidth, weaponHeight);
            }
        }
        // Check if the item has a grid in which other items can be placed (i.e. a backpack)
        let gridSize = 0;
        if (item._props.Grids !== undefined) {
            for (const grid in item._props.Grids) {
                gridSize += item._props.Grids[grid]._props.cellsH * item._props.Grids[grid]._props.cellsV;
            }
        }
        // Get the armor class for the item if applicable
        let armorClass = 0;
        if (item._props.armorClass !== undefined) {
            armorClass = Number(item._props.armorClass);
        }
        // Calculate the cost per slot
        // If the item can be equipped (backpacks, weapons, etc.), use the inventory slot size (1) instead of the item's total size
        let costPerSlot = cost;
        if (!this.canEquipItem(item)) {
            costPerSlot /= size;
        }
        // Generate the loot-ranking value based on the item properties and weighting in config.json
        let value = costPerSlot * config_json_1.default.destroy_loot_during_raid.loot_ranking.weighting.cost_per_slot;
        value += weight * config_json_1.default.destroy_loot_during_raid.loot_ranking.weighting.weight;
        value += size * config_json_1.default.destroy_loot_during_raid.loot_ranking.weighting.size;
        value += gridSize * config_json_1.default.destroy_loot_during_raid.loot_ranking.weighting.gridSize;
        value += maxDim * config_json_1.default.destroy_loot_during_raid.loot_ranking.weighting.max_dim;
        value += armorClass * config_json_1.default.destroy_loot_during_raid.loot_ranking.weighting.armor_class;
        // Determine how much additional weighting to apply if the item is a parent of any defined in config.json
        let parentWeighting = 0;
        for (const parentID in config_json_1.default.destroy_loot_during_raid.loot_ranking.weighting.parents) {
            if (CommonUtils_1.CommonUtils.hasParent(item, parentID, this.databaseTables)) {
                parentWeighting += config_json_1.default.destroy_loot_during_raid.loot_ranking.weighting.parents[parentID].value;
            }
        }
        value += parentWeighting;
        // Create the object to store in lootRanking.json 
        const data = {
            id: item._id,
            name: this.commonUtils.getItemName(item._id),
            value: value,
            costPerSlot: costPerSlot,
            weight: weight,
            size: size,
            gridSize: gridSize,
            maxDim: maxDim,
            armorClass: armorClass,
            parentWeighting: parentWeighting
        };
        return data;
    }
    /**
     * [DEPRECATED] Generate a random weapon using the SPT botWeaponGenerator.generateWeaponByTpl method.
     * @param item the base weapon template
     * @param sessionId the sessionId from the HTTP router
     * @returns a weapon represented by an array of Item objects
     */
    generateRandomWeapon(item, sessionId) {
        if (!this.weaponPresetExists(item)) {
            return [];
        }
        const iterations = 5;
        const botType = "assault";
        const possibleSlots = [
            "FirstPrimaryWeapon",
            "SecondPrimaryWeapon",
            "Holster"
        ];
        let weapon = [];
        let randomWeapon;
        for (const possibleSlot in possibleSlots) {
            for (let iteration = 0; iteration < iterations; iteration++) {
                randomWeapon = this.botWeaponGenerator.generateWeaponByTpl(sessionId, item._id, possibleSlots[possibleSlot], this.databaseTables.bots.types[botType].inventory, item._parent, this.databaseTables.bots.types[botType].chances.weaponMods, botType, false, 1);
                // If the random weapon is invalid, don't bother running more iterations; the weapon slot is wrong
                if ((randomWeapon.weapon === undefined) && (randomWeapon.weapon.length === 0)) {
                    break;
                }
                // Store the initial weapon selection
                if (weapon.length === 0) {
                    weapon = randomWeapon.weapon;
                    continue;
                }
                // Determine if the weapon is better than the previous one found
                if (this.weaponBaseValue(item, randomWeapon.weapon) > this.weaponBaseValue(item, weapon)) {
                    weapon = randomWeapon.weapon;
                }
            }
            // Check if a valid weapon was generated
            if (weapon.length > 0) {
                break;
            }
        }
        return weapon;
    }
    findBestWeaponInPresets(item) {
        let weapon = [];
        for (const presetID in this.databaseTables.globals.ItemPresets) {
            const preset = this.databaseTables.globals.ItemPresets[presetID];
            if (preset._items[0]._tpl === item._id) {
                // Store the initial weapon selection
                if (weapon.length === 0) {
                    weapon = preset._items;
                    continue;
                }
                // Determine if the weapon is better than the previous one found
                if (this.weaponBaseValue(item, preset._items) > this.weaponBaseValue(item, weapon)) {
                    weapon = preset._items;
                }
            }
        }
        // If there are no presets for the weapon, create one
        if (weapon.length === 0) {
            return this.generateWeaponPreset(item)._items;
        }
        return weapon;
    }
    weaponPresetExists(item) {
        for (const presetID in this.databaseTables.globals.ItemPresets) {
            if (this.databaseTables.globals.ItemPresets[presetID]._items[0]._tpl === item._id) {
                return true;
            }
        }
        return false;
    }
    generateWeaponPreset(item) {
        const baseWeapon = {
            _id: this.hashUtil.generate(),
            _tpl: item._id
        };
        const weapon = this.fillItemSlots(baseWeapon, []);
        if (verboseLogging)
            this.commonUtils.logInfo(`Creating preset for ${this.commonUtils.getItemName(item._id)}...`);
        for (const weaponPart in weapon) {
            if (verboseLogging)
                this.commonUtils.logInfo(`Creating preset for ${this.commonUtils.getItemName(item._id)}...found ${this.commonUtils.getItemName(weapon[weaponPart]._tpl)}`);
        }
        const preset = {
            _id: this.hashUtil.generate(),
            _type: "Preset",
            _changeWeaponName: false,
            _name: `${item._name}_autoGen`,
            _parent: weapon[0]._id,
            _items: weapon
        };
        return preset;
    }
    /**
     * Iterate through all possible slots in the object and add an item for all that are required
     * @param item the base item containing slots
     * @returns an array of Item objects containing the base item and all required attachments generated for it
     */
    fillItemSlots(item, initialBannedParts) {
        const itemTemplate = this.databaseTables.templates.items[item._tpl];
        let isValid = false;
        let filledItem;
        const bannedParts = [].concat(initialBannedParts);
        while (!isValid) {
            // Create the initial candidate for the array that will be returned
            filledItem = [];
            filledItem.push(item);
            for (const slot in itemTemplate._props.Slots) {
                if ((itemTemplate._props.Slots[slot]._required !== undefined) && !itemTemplate._props.Slots[slot]._required) {
                    continue;
                }
                // Sort the array of items that can be attached to the slot in order of ascending price
                const filters = itemTemplate._props.Slots[slot]._props.filters[0].Filter;
                const filtersSorted = filters.sort((f1, f2) => {
                    const f1Price = this.commonUtils.getMaxItemPrice(this.databaseTables.templates.items[f1]._id);
                    const f2Price = this.commonUtils.getMaxItemPrice(this.databaseTables.templates.items[f2]._id);
                    if (f1Price > f2Price)
                        return -1;
                    if (f1Price < f2Price)
                        return 1;
                    return 0;
                });
                // Add the first valid item to the slot along with all of the items attached to its (child) slots
                let itemPart;
                for (const filter in filtersSorted) {
                    if (!bannedParts.includes(filters[filter])) {
                        itemPart = {
                            _id: this.hashUtil.generate(),
                            _tpl: filters[filter],
                            parentId: item._id,
                            slotId: itemTemplate._props.Slots[slot]._name
                        };
                        filledItem = filledItem.concat(this.fillItemSlots(itemPart, bannedParts));
                        break;
                    }
                }
                if (itemPart === undefined) {
                    this.commonUtils.logError(`Could not find valid part to put in ${itemTemplate._props.Slots[slot]._name} for ${this.commonUtils.getItemName(item._tpl)}`);
                }
            }
            isValid = true;
            for (const itemPart in filledItem) {
                // Check if any conflicting parts exist in the Item array. If so, prevent the conflicting item from being used in the next candidate
                const conflictingItems = this.databaseTables.templates.items[filledItem[itemPart]._tpl]._props.ConflictingItems;
                for (const conflictingItem in conflictingItems) {
                    if (filledItem.map(p => p._tpl).includes(conflictingItems[conflictingItem])) {
                        if (!bannedParts.includes(conflictingItems[conflictingItem])) {
                            bannedParts.push(conflictingItems[conflictingItem]);
                        }
                        isValid = false;
                        if (verboseLogging)
                            this.commonUtils.logInfo(`Finding parts for ${this.commonUtils.getItemName(item._tpl)}...${this.commonUtils.getItemName(conflictingItems[conflictingItem])} has a conflict with another part`);
                        break;
                    }
                }
                if (!isValid) {
                    break;
                }
                //this.commonUtils.logInfo(`Finding parts for ${this.commonUtils.getItemName(item._tpl)}...found ${this.commonUtils.getItemName(filledItem[itemPart]._tpl)}`);
            }
        }
        return filledItem;
    }
    findBestWeaponMatchfromTraders(item) {
        let weapon = [];
        // Search all traders to see if they sell the weapon
        for (const traderID in this.databaseTables.traders) {
            const assort = this.databaseTables.traders[traderID].assort;
            // Ignore traders who don't sell anything (i.e. Lightkeeper)
            if ((assort === null) || (assort === undefined))
                continue;
            //if (verboseLogging) this.commonUtils.logInfo(`Searching ${this.databaseTables.traders[traderID].base.nickname}...`);
            for (const assortID in assort.items) {
                const weaponCandidate = [];
                if (assort.items[assortID]._tpl === item._id) {
                    // Get all parts attached to the weapon
                    const matchingSlots = this.findChildSlotIndexesInTraderAssort(assort, assortID);
                    for (const matchingSlot in matchingSlots) {
                        weaponCandidate.push(assort.items[matchingSlots[matchingSlot]]);
                    }
                    // Store the initial weapon selection
                    if (weapon.length === 0) {
                        weapon = weaponCandidate;
                        continue;
                    }
                    // Determine if the weapon is better than the previous one found
                    if (this.weaponBaseValue(item, weaponCandidate) > this.weaponBaseValue(item, weapon)) {
                        weapon = weaponCandidate;
                    }
                }
            }
        }
        return weapon;
    }
    weaponBaseValue(baseWeaponItem, weaponParts) {
        const [width, height, weight] = this.getWeaponProperties(baseWeaponItem, weaponParts);
        let value = weight * config_json_1.default.destroy_loot_during_raid.loot_ranking.weighting.weight;
        value += width * height * config_json_1.default.destroy_loot_during_raid.loot_ranking.weighting.size;
        return value;
    }
    /**
     * Gets relevant weapon properties
     * @param baseWeaponItem The base weapon template (namely the receiver)
     * @param weaponParts All parts attached to the weapon (which may include the base weapon item itself)
     * @returns [length, width, weight] of the assembled weapon
     */
    getWeaponProperties(baseWeaponItem, weaponParts) {
        let width = baseWeaponItem._props.Width;
        let height = baseWeaponItem._props.Height;
        let weight = baseWeaponItem._props.Weight;
        //if (verboseLogging) this.commonUtils.logInfo(`Getting properties for ${this.commonUtils.getItemName(baseWeaponItem._id)}... Base: Width=${width},Height=${height},Weight=${weight}`);
        for (const weaponPart in weaponParts) {
            const templateID = weaponParts[weaponPart]._tpl;
            const slotID = weaponParts[weaponPart].slotId;
            if (baseWeaponItem._id === templateID) {
                continue;
            }
            weight += this.databaseTables.templates.items[templateID]._props.Weight ?? 0;
            // Fold the weapon if possible
            if (baseWeaponItem._props.FoldedSlot !== undefined) {
                if (baseWeaponItem._props.FoldedSlot === slotID) {
                    //if (verboseLogging) this.commonUtils.logInfo(`Getting properties for ${this.commonUtils.getItemName(baseWeaponItem._id)}...folds with ${this.commonUtils.getItemName(templateID)} => Width=${width},Height=${height},Weight=${weight}`);
                    continue;
                }
            }
            width += this.databaseTables.templates.items[templateID]._props.ExtraSizeLeft ?? 0;
            width += this.databaseTables.templates.items[templateID]._props.ExtraSizeRight ?? 0;
            height += this.databaseTables.templates.items[templateID]._props.ExtraSizeUp ?? 0;
            height += this.databaseTables.templates.items[templateID]._props.ExtraSizeDown ?? 0;
            //if (verboseLogging) this.commonUtils.logInfo(`Getting properties for ${this.commonUtils.getItemName(baseWeaponItem._id)}...found ${this.commonUtils.getItemName(templateID)} => Width=${width},Height=${height},Weight=${weight}`);
        }
        if (verboseLogging)
            this.commonUtils.logInfo(`Getting properties for ${this.commonUtils.getItemName(baseWeaponItem._id)}... Final: Width=${width},Height=${height},Weight=${weight}`);
        return [width, height, weight];
    }
    findChildSlotIndexesInTraderAssort(assort, parentIndex) {
        let matchingSlots = [];
        const parentID = assort.items[parentIndex]._id;
        for (const assortID in assort.items) {
            if (assort.items[assortID].parentId === parentID) {
                matchingSlots.push(assortID);
                matchingSlots = matchingSlots.concat(this.findChildSlotIndexesInTraderAssort(assort, assortID));
            }
        }
        return matchingSlots;
    }
    validLootRankingDataExists() {
        if (!this.vfs.exists(lootFilePath)) {
            this.commonUtils.logInfo("Loot ranking data not found.");
            return false;
        }
        if (config_json_1.default.destroy_loot_during_raid.loot_ranking.alwaysRegenerate) {
            this.commonUtils.logInfo("Loot ranking data forced to regenerate.");
            this.vfs.removeFile(lootFilePath);
            return false;
        }
        // Get the current file data
        const rankingData = this.getLootRankingDataFromFile();
        // Check if the parent weighting in config.json matches the file data
        let parentParametersMatch = true;
        for (const parentID in config_json_1.default.destroy_loot_during_raid.loot_ranking.weighting.parents) {
            if (!(parentID in rankingData.parentWeighting)) {
                parentParametersMatch = false;
                break;
            }
            if (rankingData.parentWeighting[parentID].value !== config_json_1.default.destroy_loot_during_raid.loot_ranking.weighting.parents[parentID].value) {
                parentParametersMatch = false;
                break;
            }
        }
        // Check if the general weighting parameters in config.json match the file data
        if (rankingData.costPerSlot !== config_json_1.default.destroy_loot_during_raid.loot_ranking.weighting.cost_per_slot ||
            rankingData.maxDim !== config_json_1.default.destroy_loot_during_raid.loot_ranking.weighting.max_dim ||
            rankingData.size !== config_json_1.default.destroy_loot_during_raid.loot_ranking.weighting.size ||
            rankingData.gridSize !== config_json_1.default.destroy_loot_during_raid.loot_ranking.weighting.gridSize ||
            rankingData.weight !== config_json_1.default.destroy_loot_during_raid.loot_ranking.weighting.weight ||
            rankingData.armorClass !== config_json_1.default.destroy_loot_during_raid.loot_ranking.weighting.armor_class ||
            !parentParametersMatch) {
            this.commonUtils.logInfo("Loot ranking parameters have changed; deleting cached data.");
            this.vfs.removeFile(lootFilePath);
            return false;
        }
        return true;
    }
    canEquipItem(item) {
        const defaultInventory = this.databaseTables.templates.items[config_json_1.default.destroy_loot_during_raid.loot_ranking.weighting.default_inventory_id];
        if (defaultInventory === undefined) {
            return false;
        }
        for (const slot in defaultInventory._props.Slots) {
            const filters = defaultInventory._props.Slots[slot]._props.filters[0].Filter;
            for (const filter in filters) {
                if (CommonUtils_1.CommonUtils.hasParent(item, filters[filter], this.databaseTables)) {
                    //this.commonUtils.logInfo(`${this.commonUtils.getItemName(item._id)} can be equipped in ${defaultInventory._props.Slots[slot]._name}`);
                    return true;
                }
            }
        }
        return false;
    }
}
exports.LootRankingGenerator = LootRankingGenerator;
//# sourceMappingURL=LootRankingGenerator.js.map