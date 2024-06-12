"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TraderAssortGenerator = void 0;
const config_json_1 = __importDefault(require("../config/config.json"));
const hotItems_json_1 = __importDefault(require("../config/hotItems.json"));
const CommonUtils_1 = require("./CommonUtils");
class TraderAssortGenerator {
    commonUtils;
    databaseTables;
    jsonUtil;
    fenceService;
    fenceBaseAssortGenerator;
    ragfairOfferGenerator;
    ragfairOfferService;
    iTraderConfig;
    randomUtil;
    timeUtil;
    lastLL = {};
    lastAssortUpdate = {};
    lastAssort = {};
    originalFenceBaseAssortData;
    modifiedFenceItems = [];
    recentlyChangedQuests = [];
    constructor(commonUtils, databaseTables, jsonUtil, fenceService, fenceBaseAssortGenerator, ragfairOfferGenerator, ragfairOfferService, iTraderConfig, randomUtil, timeUtil) {
        this.commonUtils = commonUtils;
        this.databaseTables = databaseTables;
        this.jsonUtil = jsonUtil;
        this.fenceService = fenceService;
        this.fenceBaseAssortGenerator = fenceBaseAssortGenerator;
        this.ragfairOfferGenerator = ragfairOfferGenerator;
        this.ragfairOfferService = ragfairOfferService;
        this.iTraderConfig = iTraderConfig;
        this.randomUtil = randomUtil;
        this.timeUtil = timeUtil;
        this.modifyFenceConfig();
        this.originalFenceBaseAssortData = this.jsonUtil.clone(this.databaseTables.traders[CommonUtils_1.CommonUtils.fenceID].assort);
    }
    clearLastAssortData() {
        this.lastAssort = {};
        this.lastAssortUpdate = {};
        this.lastLL = {};
        this.modifiedFenceItems = [];
        this.recentlyChangedQuests = [];
    }
    addRecentlyChangedQuest(questID) {
        if (!this.recentlyChangedQuests.includes(questID)) {
            this.recentlyChangedQuests.push(questID);
        }
    }
    getLastTraderAssort(traderID) {
        return this.lastAssort[traderID];
    }
    getLastTraderRefreshTimestamp(traderID) {
        return this.lastAssortUpdate[traderID];
    }
    updateFleaOffers(originalOffersResult) {
        const offersResult = this.jsonUtil.clone(originalOffersResult);
        for (const offer in offersResult.offers) {
            // Only modify trader offers
            const traderEnumValue = 4;
            if ((offersResult.offers[offer].user === undefined) || (offersResult.offers[offer].user.memberType === undefined) || (offersResult.offers[offer].user.memberType !== traderEnumValue)) {
                continue;
            }
            for (const i in offersResult.offers[offer].items) {
                // Ensure the offer is valid
                if ((offersResult.offers[offer].items[i].upd === undefined) || (offersResult.offers[offer].items[i].upd.StackObjectsCount === undefined) || (offersResult.offers[offer].items[i].upd.UnlimitedCount)) {
                    continue;
                }
                // If the inventory for the trader has never been initialized, use the current data
                if (this.lastAssort[offersResult.offers[offer].user.id] === undefined) {
                    continue;
                }
                // Find the matching item in the trader's inventory. If it doesn't exist, that means it's sold out. 
                const matchingItem = this.lastAssort[offersResult.offers[offer].user.id].items.find(item => item._id === offersResult.offers[offer].items[i]._id);
                if (matchingItem === undefined) {
                    if (offersResult.offers[offer].items[i].upd.StackObjectsCount > 0) {
                        this.commonUtils.logInfo(`Depleting stock of ${this.commonUtils.getItemName(offersResult.offers[offer].items[i]._tpl)}`);
                        offersResult.offers[offer].items[i].upd.StackObjectsCount = 0;
                    }
                    continue;
                }
                // Determine how many units of the item have been sold since the last refresh, and then update the flea-market listing to reflect that change
                const stackReduction = offersResult.offers[offer].items[i].upd.StackObjectsCount - matchingItem.upd.StackObjectsCount;
                if (stackReduction > 0) {
                    this.commonUtils.logInfo(`Changing stock of ${this.commonUtils.getItemName(offersResult.offers[offer].items[i]._tpl)} from ${offersResult.offers[offer].items[i].upd.StackObjectsCount} to ${matchingItem.upd.StackObjectsCount}`);
                    offersResult.offers[offer].items[i].upd.StackObjectsCount = matchingItem.upd.StackObjectsCount;
                }
            }
        }
        return offersResult;
    }
    updateTraderStock(traderID, assort, ll, deleteDepletedItems) {
        this.commonUtils.logInfo(`Updating stock for ${this.databaseTables.traders[traderID].base.nickname}...`);
        const now = this.timeUtil.getTimestamp();
        // Initialize data for when the last assort update 
        if (this.lastLL[traderID] === undefined) {
            this.lastLL[traderID] = ll;
        }
        if (this.lastAssortUpdate[traderID] === undefined) {
            const resupplyTime = this.iTraderConfig.updateTime.find((t) => t.traderId === traderID).seconds.min;
            const timeRemaining = assort.nextResupply - now;
            this.lastAssortUpdate[traderID] = now - (resupplyTime - timeRemaining);
        }
        if ((this.lastLL[traderID] !== ll) || (this.lastAssort[traderID] === undefined) || (this.lastAssort[traderID].items.length === 0)) {
            this.commonUtils.logInfo(`Resetting last-assort cache for ${this.databaseTables.traders[traderID].base.nickname}`);
            this.lastAssort[traderID] = this.jsonUtil.clone(assort);
        }
        for (let i = 0; i < assort.items.length; i++) {
            // Ensure the stock can actually be reduced
            if ((assort.items[i].upd === undefined) || (assort.items[i].upd.StackObjectsCount === undefined) || (assort.items[i].upd.UnlimitedCount)) {
                continue;
            }
            // Skip item attachments
            if ((assort.items[i].parentId === undefined) || (assort.items[i].parentId !== "hideout")) {
                continue;
            }
            // Find the corresponding item template
            const itemTpl = this.databaseTables.templates.items[assort.items[i]._tpl];
            if (itemTpl === undefined) {
                this.commonUtils.logWarning(`Could not find template for ID ${assort.items[i]._tpl}`);
                continue;
            }
            // For Fence, combine duplicate items if possible
            if ((traderID === CommonUtils_1.CommonUtils.fenceID) && !CommonUtils_1.CommonUtils.canItemDegrade(assort.items[i], this.databaseTables)) {
                for (let j = i + 1; j < assort.items.length; j++) {
                    if (assort.items[j]._tpl === assort.items[i]._tpl) {
                        //this.commonUtils.logInfo(`Combining ${this.commonUtils.getItemName(assort.items[i]._tpl)} in assort...`);
                        this.removeIndexFromTraderAssort(assort, j);
                        assort.items[i].upd.StackObjectsCount += 1;
                    }
                }
            }
            // Update the stack size unless there was just a trader reset
            if (this.lastAssort[traderID].nextResupply === assort.nextResupply) {
                // Find the matching item from the previous trader inventory update
                const lastAssortItem = this.lastAssort[traderID].items.find((item) => (item._id === assort.items[i]._id));
                if (lastAssortItem !== undefined) {
                    // Determine how much to reduce the stack size
                    const isBarter = this.isBarterTrade(assort, assort.items[i]._id);
                    const stackSizeReduction = Math.max(0, this.getStackSizeReduction(assort.items[i], isBarter, assort.nextResupply, assort.items[i].upd.StackObjectsCount, lastAssortItem.upd.StackObjectsCount, traderID));
                    // Update the stack size
                    const newStackSize = lastAssortItem.upd.StackObjectsCount - stackSizeReduction;
                    if (newStackSize <= 0) {
                        //this.commonUtils.logInfo(`Reducing stock of ${this.commonUtils.getItemName(assort.items[i]._tpl)} from ${lastAssortItem.upd.StackObjectsCount} to ${newStackSize}...`);
                    }
                    assort.items[i].upd.StackObjectsCount = newStackSize;
                }
                else {
                    // Check if the assort was just unlocked due to a recent quest status change
                    const questID = this.getIDofRecentlyChangedQuestForItem(assort.items[i], traderID);
                    if (questID !== undefined) {
                        this.commonUtils.logInfo(`Resetting stock of ${this.commonUtils.getItemName(assort.items[i]._tpl)} due to recently completed quest ${questID}`);
                        this.recentlyChangedQuests.splice(this.recentlyChangedQuests.indexOf(questID), 1);
                    }
                    else {
                        // If the item wasn't in the previous assort, the stock was depleted
                        //this.commonUtils.logInfo(`Stock of ${this.commonUtils.getItemName(assort.items[i]._tpl)} is depleted.`);
                        assort.items[i].upd.StackObjectsCount = 0;
                    }
                }
            }
            // Set the initial stack size for Fence's ammo offers
            const isAmmo = itemTpl._parent === config_json_1.default.trader_stock_changes.ammo_parent_id;
            if ((traderID === CommonUtils_1.CommonUtils.fenceID) && isAmmo && (assort.items[i].upd.StackObjectsCount === 1)) {
                assort.items[i].upd.StackObjectsCount = this.randomUtil.randInt(0, config_json_1.default.trader_stock_changes.fence_stock_changes.max_ammo_stack);
            }
            // Check if the stock has been depleted
            if (assort.items[i].upd.StackObjectsCount <= 0) {
                // Remove ammo that is sold out
                if (deleteDepletedItems) {
                    this.removeIndexFromTraderAssort(assort, i);
                    i--;
                }
                else {
                    assort.items[i].upd.StackObjectsCount = 0;
                }
            }
        }
        // Update the resupply time and stock
        this.lastAssort[traderID] = this.jsonUtil.clone(assort);
        this.lastAssortUpdate[traderID] = now;
        //this.commonUtils.logInfo(`Updating stock for ${this.databaseTables.traders[traderID].base.nickname}...done.`);
        return assort;
    }
    updateFenceAssort() {
        this.updateFenceAssortIDs();
        // Ensure the new assorts are generated at least once
        if ((this.lastAssort[CommonUtils_1.CommonUtils.fenceID] === undefined) || config_json_1.default.trader_stock_changes.fence_stock_changes.always_regenerate) {
            this.generateNewFenceAssorts();
        }
    }
    generateNewFenceAssorts() {
        this.fenceService.generateFenceAssorts();
        this.modifiedFenceItems = [];
    }
    replenishFenceStockIfNeeded(currentAssort, maxLL) {
        const ll1ItemIDs = TraderAssortGenerator.getTraderAssortIDsforLL(currentAssort, 1);
        const ll2ItemIDs = TraderAssortGenerator.getTraderAssortIDsforLL(currentAssort, 2);
        if ((ll1ItemIDs.length < config_json_1.default.trader_stock_changes.fence_stock_changes.assort_size * config_json_1.default.trader_stock_changes.fence_stock_changes.assort_restock_threshold / 100)
            || ((maxLL > 1) && (ll2ItemIDs.length < config_json_1.default.trader_stock_changes.fence_stock_changes.assort_size_discount * config_json_1.default.trader_stock_changes.fence_stock_changes.assort_restock_threshold / 100))) {
            //this.commonUtils.logInfo(`Replenishing Fence's assorts. Current LL1 items: ${ll1ItemIDs.length}, LL2 items: ${ll2ItemIDs.length}`);
            this.generateNewFenceAssorts();
            return true;
        }
        return false;
    }
    updateFenceAssortIDs() {
        const assort = this.jsonUtil.clone(this.originalFenceBaseAssortData);
        for (const itemID in this.originalFenceBaseAssortData.loyal_level_items) {
            const itemPrice = this.commonUtils.getMaxItemPrice(itemID);
            const permittedChance = CommonUtils_1.CommonUtils.interpolateForFirstCol(config_json_1.default.fence_item_value_permitted_chance, itemPrice);
            const randNum = this.randomUtil.getFloat(0, 100);
            // Allow the item in Fence's inventory if it's valid and below the minimum price threshold
            if ((itemPrice > 0) && (itemPrice <= config_json_1.default.trader_stock_changes.fence_stock_changes.min_allowed_item_value)) {
                continue;
            }
            // Determine if the item should be allowed in Fence's assorts
            if ((itemPrice === 0) || (permittedChance <= randNum)) {
                // Ensure the index is valid
                const itemIndex = assort.items.findIndex((i) => i._id === itemID);
                if (itemIndex < 0) {
                    this.commonUtils.logError(`Invalid item: ${itemID}`);
                    continue;
                }
                this.removeIndexFromTraderAssort(assort, itemIndex);
            }
        }
        this.fenceService.setFenceAssort(assort);
        //const originalAssortCount = Object.keys(this.originalFenceBaseAssortData.loyal_level_items).length;
        //const newAssortCount = Object.keys(this.databaseTables.traders[Traders.FENCE].assort.loyal_level_items).length;
        //this.commonUtils.logInfo(`Updated Fence assort data: ${newAssortCount}/${originalAssortCount} items are available for sale.`);
    }
    removeExpensivePresets(assort, maxCost) {
        for (let i = 0; i < assort.items.length; i++) {
            if ((assort.items[i].upd === undefined) || (assort.items[i].upd.sptPresetId === undefined) || (assort.items[i].upd.sptPresetId.length === 0)) {
                continue;
            }
            const id = assort.items[i]._id;
            const cost = assort.barter_scheme[id][0][0].count;
            if (cost > maxCost) {
                //this.commonUtils.logInfo(`Removing preset for ${this.commonUtils.getItemName(assort.items[i]._tpl)}...`);
                this.removeIndexFromTraderAssort(assort, i);
                i--;
            }
        }
    }
    adjustFenceAssortItemPrices(assort) {
        for (const i in assort.items) {
            if (!CommonUtils_1.CommonUtils.canItemDegrade(assort.items[i], this.databaseTables)) {
                continue;
            }
            // Find the corresponding item template
            const itemTpl = this.databaseTables.templates.items[assort.items[i]._tpl];
            if (itemTpl === undefined) {
                this.commonUtils.logError(`Could not find template for ID ${assort.items[i]._tpl}`);
                continue;
            }
            if (assort.items[i].upd.MedKit !== undefined) {
                const durabilityFraction = assort.items[i].upd.MedKit.HpResource / itemTpl._props.MaxHpResource;
                this.adjustFenceItemPrice(assort, assort.items[i], durabilityFraction);
                continue;
            }
            if (assort.items[i].upd.Resource !== undefined) {
                const durabilityFraction = assort.items[i].upd.Resource.Value / itemTpl._props.MaxResource;
                this.adjustFenceItemPrice(assort, assort.items[i], durabilityFraction);
                continue;
            }
            if (assort.items[i].upd.Repairable !== undefined) {
                const durabilityFraction = assort.items[i].upd.Repairable.Durability / itemTpl._props.MaxDurability;
                this.adjustFenceItemPrice(assort, assort.items[i], durabilityFraction);
            }
        }
    }
    getStackSizeReduction(item, isbarter, nextResupply, originalStock, currentStock, traderID) {
        const now = this.timeUtil.getTimestamp();
        // Find the corresponding item template
        const itemTpl = this.databaseTables.templates.items[item._tpl];
        if (itemTpl === undefined) {
            this.commonUtils.logError(`Could not find template for ID ${item._tpl}`);
            return 0;
        }
        const fenceMult = (traderID === CommonUtils_1.CommonUtils.fenceID ? config_json_1.default.trader_stock_changes.fence_stock_changes.sell_chance_multiplier : 1);
        let selloutMult = this.randomUtil.getInt(config_json_1.default.trader_stock_changes.item_sellout_chance.min, config_json_1.default.trader_stock_changes.item_sellout_chance.max) / 100;
        selloutMult *= isbarter ? config_json_1.default.trader_stock_changes.barter_trade_sellout_factor : 1;
        if (itemTpl._id in hotItems_json_1.default) {
            selloutMult *= hotItems_json_1.default[itemTpl._id].value * config_json_1.default.trader_stock_changes.hot_item_sell_chance_global_multiplier;
        }
        let maxBuyRate = config_json_1.default.trader_stock_changes.max_ammo_buy_rate / (config_json_1.default.debug.enabled ? config_json_1.default.debug.trader_resupply_time_factor : 1);
        if (itemTpl._parent === config_json_1.default.trader_stock_changes.ammo_parent_id) {
            return Math.round(selloutMult * maxBuyRate / fenceMult * (now - this.lastAssortUpdate[traderID]));
        }
        maxBuyRate = config_json_1.default.trader_stock_changes.max_item_buy_rate / (config_json_1.default.debug.enabled ? config_json_1.default.debug.trader_resupply_time_factor : 1);
        const refreshFractionElapsed = 1 - ((nextResupply - now) / this.iTraderConfig.updateTime.find((t) => t.traderId === traderID).seconds.min);
        const maxItemsSold = selloutMult * originalStock * refreshFractionElapsed * fenceMult;
        const itemsSold = originalStock - currentStock;
        const maxReduction = selloutMult * maxBuyRate * (now - this.lastAssortUpdate[traderID]);
        const itemsToSell = Math.round(Math.max(0, Math.min(maxItemsSold - itemsSold, maxReduction)));
        //this.commonUtils.logInfo(`Refresh fraction: ${refreshFractionElapsed}, Max items sold: ${maxItemsSold}, Items to sell; ${itemsToSell}`);
        return itemsToSell;
    }
    isBarterTrade(assort, itemID) {
        if (assort.barter_scheme[itemID] === undefined) {
            // Ensure the item isn't an attachment for another item
            if (assort.items.find((i) => i._id === itemID).parentId !== "hideout") {
                return false;
            }
            this.commonUtils.logError(`Could not find barter template for ID ${itemID}`);
            return false;
        }
        for (const i in assort.barter_scheme[itemID][0]) {
            const barterItemTpl = assort.barter_scheme[itemID][0][i]._tpl;
            // Find the corresponding item template
            const itemTpl = this.databaseTables.templates.items[barterItemTpl];
            if (itemTpl === undefined) {
                this.commonUtils.logError(`Could not find template for ID ${barterItemTpl}`);
                return false;
            }
            // Check if currency is used to purchase the item
            if (CommonUtils_1.CommonUtils.hasParent(itemTpl, config_json_1.default.trader_stock_changes.money_parent_id, this.databaseTables)) {
                return false;
            }
        }
        //this.commonUtils.logInfo(`Item ${this.commonUtils.getItemName(assort.items.find((i) => i._id == itemID)._tpl)} is a barter trade.`);
        return true;
    }
    adjustFenceItemPrice(assort, item, durabilityFraction) {
        // Ensure the item hasn't already been modified
        const id = item._id;
        if (this.modifiedFenceItems.includes(id)) {
            return;
        }
        const costFactor = CommonUtils_1.CommonUtils.interpolateForFirstCol(config_json_1.default.item_cost_fraction_vs_durability, durabilityFraction);
        //this.commonUtils.logInfo(`Modifying value of ${this.commonUtils.getItemName(item._tpl)} by ${costFactor} for durability fraction of ${durabilityFraction}...`);
        assort.barter_scheme[id][0][0].count *= costFactor;
        this.modifiedFenceItems.push(id);
    }
    removeIndexFromTraderAssort(assort, index) {
        const itemID = assort.items[index]._id;
        delete assort.loyal_level_items[itemID];
        delete assort.barter_scheme[itemID];
        assort.items.splice(index, 1);
    }
    modifyFenceConfig() {
        // Adjust assort size and variety
        this.iTraderConfig.fence.assortSize = config_json_1.default.trader_stock_changes.fence_stock_changes.assort_size;
        this.iTraderConfig.fence.discountOptions.assortSize = config_json_1.default.trader_stock_changes.fence_stock_changes.assort_size_discount;
        this.iTraderConfig.fence.weaponPresetMinMax.max = config_json_1.default.trader_stock_changes.fence_stock_changes.maxPresetsPercent;
        for (const itemID in config_json_1.default.trader_stock_changes.fence_stock_changes.itemTypeLimits_Override) {
            this.iTraderConfig.fence.itemTypeLimits[itemID] = config_json_1.default.trader_stock_changes.fence_stock_changes.itemTypeLimits_Override[itemID];
        }
        // Add or remove ID's from the blacklist
        this.iTraderConfig.fence.blacklist = this.iTraderConfig.fence.blacklist.concat(config_json_1.default.trader_stock_changes.fence_stock_changes.blacklist_append);
        const removeID = config_json_1.default.trader_stock_changes.fence_stock_changes.blacklist_remove;
        for (const i in removeID) {
            if (this.iTraderConfig.fence.blacklist.includes(removeID[i])) {
                this.iTraderConfig.fence.blacklist.splice(this.iTraderConfig.fence.blacklist.indexOf(removeID[i]), 1);
            }
        }
        // Exclude high-tier ammo from Fence's assorts
        const allItems = this.databaseTables.templates.items;
        for (const itemID in allItems) {
            if (allItems[itemID]._parent !== config_json_1.default.trader_stock_changes.ammo_parent_id) {
                continue;
            }
            if ((allItems[itemID]._props.PenetrationPower === undefined) || (allItems[itemID]._props.Damage === undefined)) {
                continue;
            }
            if (allItems[itemID]._props.PenetrationPower > config_json_1.default.trader_stock_changes.fence_stock_changes.blacklist_ammo_penetration_limit) {
                this.iTraderConfig.fence.blacklist.push(itemID);
                continue;
            }
            if (allItems[itemID]._props.Damage > config_json_1.default.trader_stock_changes.fence_stock_changes.blacklist_ammo_damage_limit) {
                this.iTraderConfig.fence.blacklist.push(itemID);
            }
        }
        // Update Fence's base assorts
        //this.commonUtils.logInfo(`Original Fence assort data: ${this.databaseTables.traders[Traders.FENCE].assort.items.length} items are available for sale.`);
        this.databaseTables.traders[CommonUtils_1.CommonUtils.fenceID].assort.barter_scheme = {};
        this.databaseTables.traders[CommonUtils_1.CommonUtils.fenceID].assort.items = [];
        this.databaseTables.traders[CommonUtils_1.CommonUtils.fenceID].assort.loyal_level_items = {};
        this.databaseTables.traders[CommonUtils_1.CommonUtils.fenceID].assort.nextResupply = this.fenceService.getNextFenceUpdateTimestamp();
        this.fenceBaseAssortGenerator.generateFenceBaseAssorts();
        //this.commonUtils.logInfo(`Updated Fence assort data: ${this.databaseTables.traders[Traders.FENCE].assort.items.length} items are available for sale.`);
    }
    static getTraderAssortIDsforLL(assort, ll) {
        const ids = [];
        for (const id in assort.loyal_level_items) {
            if (assort.loyal_level_items[id] === ll) {
                ids.push(id);
            }
        }
        return ids;
    }
    getIDofRecentlyChangedQuestForItem(item, traderID) {
        const questassort = this.databaseTables.traders[traderID].questassort;
        if (questassort === undefined) {
            return undefined;
        }
        // Search each quest status (success, started, fail)
        for (const questStatus in questassort) {
            // Check if the assort is quest-locked
            if (!(item._id in questassort[questStatus])) {
                continue;
            }
            // Check if the quest that unlocks the assort recently had a status change reported by the client
            const questID = questassort[questStatus][item._id];
            if (this.recentlyChangedQuests.includes(questID)) {
                return questID;
            }
        }
        return undefined;
    }
}
exports.TraderAssortGenerator = TraderAssortGenerator;
//# sourceMappingURL=TraderAssortGenerator.js.map