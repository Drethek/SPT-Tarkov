"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseClasses_1 = require("C:/snapshot/project/obj/models/enums/BaseClasses");
const LogTextColor_1 = require("C:/snapshot/project/obj/models/spt/logging/LogTextColor");
//import { LogBackgroundColor } from "C:/snapshot/project/obj/models/spt/logging/LogBackgroundColor";
const debug_1 = require("./debug");
const config = __importStar(require("../config/config.json"));
class Mod {
    caseConfigNames = [
        "Golden Key Pouch",
        "Golden Keychain Mk. I",
        "Golden Keychain Mk. II",
        "Golden Keychain Mk. III",
        "Golden Keycard Case"
    ];
    newIdMap = {
        Golden_Key_Pouch: "661cb36922c9e10dc2d9514b",
        Golden_Keycard_Case: "661cb36f5441dc730e28bcb0",
        Golden_Keychain1: "661cb372e5eb56290da76c3e",
        Golden_Keychain2: "661cb3743bf00d3d145518b3",
        Golden_Keychain3: "661cb376b16226f648eb0cdc"
    };
    logger;
    modName;
    modVersion;
    container;
    profileHelper;
    itemHelper;
    constructor() {
        this.modName = "Gilded Key Storage";
    }
    postAkiLoad(container) {
        this.container = container;
    }
    preAkiLoad(container) {
        const staticRouterModService = container.resolve("StaticRouterModService");
        const saveServer = container.resolve("SaveServer");
        const logger = container.resolve("WinstonLogger");
        this.profileHelper = container.resolve("ProfileHelper");
        this.itemHelper = container.resolve("ItemHelper");
        // On game start, see if we need to fix issues from previous versions
        // Note: We do this as a method replacement so we can run _before_ SPT's gameStart
        container.afterResolution("GameController", (_, result) => {
            const originalGameStart = result.gameStart;
            result.gameStart = (url, info, sessionID, startTimeStampMS) => {
                // If there's a profile ID passed in, call our fixer method
                if (sessionID) {
                    this.fixProfile(sessionID);
                }
                // Call the original
                originalGameStart.apply(result, [url, info, sessionID, startTimeStampMS]);
            };
        });
        // Setup debugging if enabled
        const debugUtil = new debug_1.Debug();
        debugUtil.giveProfileAllKeysAndGildedCases(staticRouterModService, saveServer, logger);
        debugUtil.removeAllDebugInstanceIdsFromProfile(staticRouterModService, saveServer);
    }
    postDBLoad(container) {
        this.logger = container.resolve("WinstonLogger");
        this.logger.log(`[${this.modName}] : Mod loading`, LogTextColor_1.LogTextColor.GREEN);
        const debugUtil = new debug_1.Debug();
        const databaseServer = container.resolve("DatabaseServer");
        const dbTables = databaseServer.getTables();
        const restrInRaid = dbTables.globals.config.RestrictionsInRaid;
        const dbTemplates = dbTables.templates;
        const dbTraders = dbTables.traders;
        const dbItems = dbTemplates.items;
        const dbLocales = dbTables.locales.global.en;
        this.combatibilityThings(dbItems);
        for (const configName of this.caseConfigNames) {
            this.createCase(container, config[configName], dbTables);
        }
        this.pushSupportiveBarters(dbTraders);
        this.adjustItemProperties(dbItems);
        this.setLabsCardInRaidLimit(restrInRaid, 9);
        debugUtil.logMissingKeys(this.logger, this.itemHelper, dbItems, dbLocales);
    }
    pushSupportiveBarters(dbTraders) {
        const additionalBarters = config["Additional Barter Trades"];
        for (const bart in additionalBarters) {
            this.pushToTrader(additionalBarters[bart], additionalBarters[bart].id, dbTraders);
        }
    }
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    setLabsCardInRaidLimit(restrInRaid, limitAmount) {
        if (restrInRaid === undefined)
            return;
        //restrInRaid type set to any to shut the linter up because the type doesn't include MaxIn... props
        //set labs access card limit in raid to 9 so the keycard case can be filled while on pmc
        for (const restr in restrInRaid) {
            const thisRestriction = restrInRaid[restr];
            if (thisRestriction.TemplateId === "5c94bbff86f7747ee735c08f") {
                thisRestriction.MaxInLobby = limitAmount;
                thisRestriction.MaxInRaid = limitAmount;
            }
        }
    }
    adjustItemProperties(dbItems) {
        for (const [_, item] of Object.entries(dbItems)) {
            // Skip anything that isn't specifically an Item type item
            if (item._type !== "Item") {
                continue;
            }
            const itemProps = item._props;
            // Adjust key specific properties
            if (this.itemHelper.isOfBaseclass(item._id, BaseClasses_1.BaseClasses.KEY)) {
                if (config.weightless_keys) {
                    itemProps.Weight = 0.0;
                }
                itemProps.InsuranceDisabled = !config.key_insurance_enabled;
                // If keys are to be set to no limit, and we're either not using the finite keys list, or this key doesn't exist
                // in it, set the key max usage to 0 (infinite)
                if (config.no_key_use_limit &&
                    (!config.use_finite_keys_list || !config.finite_keys_list.includes(item._id))) {
                    itemProps.MaximumNumberOfUsage = 0;
                }
                if (config.keys_are_discardable) {
                    itemProps.DiscardLimit = -1;
                }
            }
            // Remove keys from secure container exclude filter
            if (config.all_keys_in_secure && this.itemHelper.isOfBaseclass(item._id, BaseClasses_1.BaseClasses.MOB_CONTAINER)) {
                const filter = itemProps?.Grids[0]?._props?.filters[0];
                if (filter) {
                    // Exclude items with a base class of KEY. Have to check that it's an "Item" type first because isOfBaseClass only accepts Items
                    filter.ExcludedFilter = filter.ExcludedFilter.filter(itemTpl => this.itemHelper.getItem(itemTpl)[1]._type !== "Item" || !this.itemHelper.isOfBaseclass(itemTpl, BaseClasses_1.BaseClasses.KEY));
                }
            }
        }
    }
    combatibilityThings(dbItems) {
        //do a compatibility correction to make this mod work with other mods with destructive code (cough, SVM, cough)
        //basically just add the filters element back to backpacks and secure containers if they've been removed by other mods
        const compatFiltersElement = [{ Filter: [BaseClasses_1.BaseClasses.ITEM], ExcludedFilter: [] }];
        for (const [_, item] of Object.entries(dbItems)) {
            // Skip non-items
            if (item._type !== "Item")
                continue;
            if (item._parent === BaseClasses_1.BaseClasses.BACKPACK ||
                item._parent === BaseClasses_1.BaseClasses.VEST ||
                (this.itemHelper.isOfBaseclass(item._id, BaseClasses_1.BaseClasses.MOB_CONTAINER) && item._id !== "5c0a794586f77461c458f892")) {
                if (item._props.Grids[0]._props.filters[0] === undefined) {
                    item._props.Grids[0]._props.filters = structuredClone(compatFiltersElement);
                }
            }
        }
    }
    createCase(container, config, tables) {
        const handbook = tables.templates.handbook;
        const locales = Object.values(tables.locales.global);
        const itemID = config.id;
        const itemPrefabPath = `CaseBundles/${itemID}.bundle`;
        const templateId = this.newIdMap[itemID];
        // biome-ignore lint/suspicious/noExplicitAny: <explanation>
        let item;
        //clone a case
        if (config.case_type === "container") {
            item = structuredClone(tables.templates.items["5d235bb686f77443f4331278"]);
            item._props.IsAlwaysAvailableForInsurance = true;
            item._props.DiscardLimit = -1;
        }
        if (config.case_type === "slots") {
            item = structuredClone(tables.templates.items["5a9d6d00a2750c5c985b5305"]);
            item._props.IsAlwaysAvailableForInsurance = true;
            item._props.DiscardLimit = -1;
            item._props.ItemSound = config.sound;
        }
        item._id = templateId;
        item._props.Prefab.path = itemPrefabPath;
        //call methods to set the grid or slot cells up
        if (config.case_type === "container") {
            item._props.Grids = this.createGrid(container, templateId, config);
        }
        if (config.case_type === "slots") {
            item._props.Slots = this.createSlot(container, templateId, config);
        }
        //set external size of the container:
        item._props.Width = config.ExternalSize.width;
        item._props.Height = config.ExternalSize.height;
        tables.templates.items[templateId] = item;
        //add locales
        for (const locale of locales) {
            locale[`${templateId} Name`] = config.item_name;
            locale[`${templateId} ShortName`] = config.item_short_name;
            locale[`${templateId} Description`] = config.item_description;
        }
        item._props.CanSellOnRagfair = !config.flea_banned;
        item._props.InsuranceDisabled = !config.insurance_enabled;
        const price = config.flea_price;
        handbook.Items.push({
            Id: templateId,
            ParentId: "5b5f6fa186f77409407a7eb7",
            Price: price
        });
        //allow or disallow in secure containers, backpacks, other specific items per the config
        this.allowIntoContainers(templateId, tables.templates.items, config.allow_in_secure_containers, config.allow_in_backpacks, config.case_allowed_in, config.case_disallowed_in);
        this.pushToTrader(config, templateId, tables.traders);
        //log success!
        this.logger.log(`[${this.modName}] : ${config.item_name} loaded! Hooray!`, LogTextColor_1.LogTextColor.GREEN);
    }
    pushToTrader(config, itemID, dbTraders) {
        const traderIDs = {
            mechanic: "5a7c2eca46aef81a7ca2145d",
            skier: "58330581ace78e27b8b10cee",
            peacekeeper: "5935c25fb3acc3127c3d8cd9",
            therapist: "54cb57776803fa99248b456e",
            prapor: "54cb50c76803fa8b248b4571",
            jaeger: "5c0647fdd443bc2504c2d371",
            ragman: "5ac3b934156ae10c4430e83c"
        };
        /*
        const currencyIDs = {
            "roubles": "5449016a4bdc2d6f028b456f",
            "euros": "569668774bdc2da2298b4568",
            "dollars": "5696686a4bdc2da3298b456a"
        };
        */
        //add to config trader's inventory
        let traderToPush = config.trader;
        for (const [key, val] of Object.entries(traderIDs)) {
            if (key === config.trader) {
                traderToPush = val;
            }
        }
        const trader = dbTraders[traderToPush];
        trader.assort.items.push({
            _id: itemID,
            _tpl: itemID,
            parentId: "hideout",
            slotId: "hideout",
            upd: {
                UnlimitedCount: config.unlimited_stock,
                StackObjectsCount: config.stock_amount
            }
        });
        // biome-ignore lint/suspicious/noExplicitAny: <explanation>
        const barterTrade = [];
        const configBarters = config.barter;
        for (const barter in configBarters) {
            barterTrade.push(configBarters[barter]);
        }
        trader.assort.barter_scheme[itemID] = [barterTrade];
        trader.assort.loyal_level_items[itemID] = config.trader_loyalty_level;
    }
    allowIntoContainers(itemID, items, secContainers, backpacks, addAllowedIn, addDisallowedIn) {
        for (const [_, item] of Object.entries(items)) {
            // Skip non-items
            if (item._type !== "Item")
                continue;
            //disallow in backpacks
            if (!backpacks) {
                this.allowOrDisallowIntoCaseByParent(itemID, "exclude", item, BaseClasses_1.BaseClasses.BACKPACK);
            }
            //allow in secure containers
            if (secContainers) {
                this.allowOrDisallowIntoCaseByParent(itemID, "include", item, BaseClasses_1.BaseClasses.MOB_CONTAINER);
            }
            //disallow in additional specific items
            for (const configItem in addDisallowedIn) {
                if (addDisallowedIn[configItem] === item._id) {
                    this.allowOrDisallowIntoCaseByID(itemID, "exclude", item);
                }
            }
            //allow in additional specific items
            for (const configItem in addAllowedIn) {
                if (addAllowedIn[configItem] === item._id) {
                    this.allowOrDisallowIntoCaseByID(itemID, "include", item);
                }
            }
        }
    }
    allowOrDisallowIntoCaseByParent(customItemID, includeOrExclude, currentItem, caseParent) {
        //exclude custom case in all items of caseToApplyTo parent
        if (includeOrExclude === "exclude") {
            for (const gridKey in currentItem._props.Grids) {
                if (currentItem._parent === caseParent && currentItem._id !== "5c0a794586f77461c458f892") {
                    if (currentItem._props.Grids[gridKey]._props.filters[0].ExcludedFilter === undefined) {
                        currentItem._props.Grids[gridKey]._props.filters[0].ExcludedFilter = [customItemID];
                    }
                    else {
                        currentItem._props.Grids[gridKey]._props.filters[0].ExcludedFilter.push(customItemID);
                    }
                }
            }
        }
        //include custom case in all items of caseToApplyTo parent
        if (includeOrExclude === "include") {
            if (currentItem._parent === caseParent && currentItem._id !== "5c0a794586f77461c458f892") {
                if (currentItem._props.Grids[0]._props.filters[0].Filter === undefined) {
                    currentItem._props.Grids[0]._props.filters[0].Filter = [customItemID];
                }
                else {
                    currentItem._props.Grids[0]._props.filters[0].Filter.push(customItemID);
                }
            }
        }
    }
    allowOrDisallowIntoCaseByID(customItemID, includeOrExclude, currentItem) {
        //exclude custom case in specific item of caseToApplyTo id
        if (includeOrExclude === "exclude") {
            if (currentItem._props.Grids[0]._props.filters[0].ExcludedFilter === undefined) {
                currentItem._props.Grids[0]._props.filters[0].ExcludedFilter = [customItemID];
            }
            else {
                currentItem._props.Grids[0]._props.filters[0].ExcludedFilter.push(customItemID);
            }
        }
        //include custom case in specific item of caseToApplyTo id
        if (includeOrExclude === "include") {
            if (currentItem._props.Grids[0]._props.filters[0].Filter === undefined) {
                currentItem._props.Grids[0]._props.filters[0].Filter = [customItemID];
            }
            else {
                currentItem._props.Grids[0]._props.filters[0].Filter.push(customItemID);
            }
        }
    }
    createGrid(container, itemID, config) {
        const grids = [];
        let cellHeight = config.InternalSize.vertical_cells;
        let cellWidth = config.InternalSize.horizontal_cells;
        const inFilt = this.replaceOldIdWithNewId(config.included_filter);
        const exFilt = this.replaceOldIdWithNewId(config.excluded_filter);
        const UCcellToApply = config.cell_to_apply_filters_to;
        const UCinFilt = this.replaceOldIdWithNewId(config.unique_included_filter);
        const UCexFilt = this.replaceOldIdWithNewId(config.unique_excluded_filter);
        //if inFilt is empty set it to the base item id so the case will accept all items
        if (inFilt.length === 1 && inFilt[0] === "") {
            inFilt[0] = BaseClasses_1.BaseClasses.ITEM;
        }
        if (UCinFilt.length === 1 && UCinFilt[0] === "") {
            UCinFilt[0] = BaseClasses_1.BaseClasses.ITEM;
        }
        //if num of width and height cells are not the same, set case to 1x1 and throw warning msg
        if (cellHeight.length !== cellWidth.length) {
            cellHeight = [1];
            cellWidth = [1];
            this.logger.log(`[${this.modName}] : WARNING: number of internal and vertical cells must be the same.`, LogTextColor_1.LogTextColor.RED);
            this.logger.log(`[${this.modName}] : WARNING: setting ${config.item_name} to be 1 1x1 cell.`, LogTextColor_1.LogTextColor.RED);
        }
        for (let i = 0; i < cellWidth.length; i++) {
            if ((i === UCcellToApply - 1) || (UCcellToApply[i] === ("y" || "Y"))) {
                grids.push(this.generateGridColumn(container, itemID, `column${i}`, cellWidth[i], cellHeight[i], UCinFilt, UCexFilt));
            }
            else {
                grids.push(this.generateGridColumn(container, itemID, `column${i}`, cellWidth[i], cellHeight[i], inFilt, exFilt));
            }
        }
        return grids;
    }
    replaceOldIdWithNewId(entries) {
        const newIdKeys = Object.keys(this.newIdMap);
        for (let i = 0; i < entries.length; i++) {
            if (newIdKeys.includes(entries[i])) {
                entries[i] = this.newIdMap[entries[i]];
            }
        }
        return entries;
    }
    createSlot(container, itemID, config) {
        const slots = [];
        const configSlots = config.slot_ids;
        for (let i = 0; i < configSlots.length; i++) {
            slots.push(this.generateSlotColumn(container, itemID, `mod_mount_${i}`, configSlots[i]));
        }
        return slots;
    }
    generateGridColumn(container, itemID, name, cellH, cellV, inFilt, exFilt) {
        const hashUtil = container.resolve("HashUtil");
        return {
            _name: name,
            _id: hashUtil.generate(),
            _parent: itemID,
            _props: {
                filters: [
                    {
                        Filter: [...inFilt],
                        ExcludedFilter: [...exFilt]
                    }
                ],
                cellsH: cellH,
                cellsV: cellV,
                minCount: 0,
                maxCount: 0,
                maxWeight: 0,
                isSortingTable: false
            }
        };
    }
    generateSlotColumn(container, itemID, name, configSlot) {
        const hashUtil = container.resolve("HashUtil");
        return {
            _name: name,
            _id: hashUtil.generate(),
            _parent: itemID,
            _props: {
                filters: [
                    {
                        Filter: [configSlot],
                        ExcludedFilter: []
                    }
                ],
                _required: false,
                _mergeSlotWithChildren: false
            }
        };
    }
    // Handle updating the user profile between versions:
    // - Update the container IDs to the new MongoID format
    // - Look for any key cases in the user's inventory, and properly update the child key locations if we've moved them
    fixProfile(sessionId) {
        const databaseServer = this.container.resolve("DatabaseServer");
        const dbTables = databaseServer.getTables();
        const dbItems = dbTables.templates.items;
        const pmcProfile = this.profileHelper.getFullProfile(sessionId)?.characters?.pmc;
        // Do nothing if the profile isn't initialized
        if (!pmcProfile?.Inventory?.items)
            return;
        // Update the container IDs to the new MongoID format
        for (const item of pmcProfile.Inventory.items) {
            if (this.newIdMap[item._tpl]) {
                item._tpl = this.newIdMap[item._tpl];
            }
        }
        // Backup the PMC inventory
        const pmcInventory = structuredClone(pmcProfile.Inventory.items);
        // Look for any key cases in the user's inventory, and properly update the child key locations if we've moved them
        for (const configName of this.caseConfigNames) {
            // Skip cases that aren't set slots
            const caseConfig = config[configName];
            if (caseConfig.case_type !== "slots")
                continue;
            // Get the template for the case
            const caseTemplate = dbItems[caseConfig.id];
            // Try to find the case in the user's profile
            const inventoryCases = pmcProfile.Inventory.items.filter(x => x._tpl === caseConfig.id);
            for (const inventoryCase of inventoryCases) {
                const caseChildren = pmcProfile.Inventory.items.filter(x => x.parentId === inventoryCase._id);
                for (const child of caseChildren) {
                    const newSlot = caseTemplate._props?.Slots?.find(x => x._props?.filters[0]?.Filter[0] === child._tpl);
                    // If we couldn't find a new slot for this key, something has gone horribly wrong, restore the inventory and exit
                    if (!newSlot) {
                        this.logger.error(`[${this.modName}] : ERROR: Unable to find new slot for ${child._tpl}. Restoring inventory and exiting`);
                        pmcProfile.Inventory.items = pmcInventory;
                        return;
                    }
                    if (newSlot._name !== child.slotId) {
                        this.logger.debug(`[${this.modName}] : Need to move ${child.slotId} to ${newSlot._name}`);
                        child.slotId = newSlot._name;
                    }
                }
            }
        }
    }
}
module.exports = { mod: new Mod() };
//# sourceMappingURL=mod.js.map