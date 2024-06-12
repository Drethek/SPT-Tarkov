"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommonUtils = void 0;
const config_json_1 = __importDefault(require("../config/config.json"));
class CommonUtils {
    logger;
    databaseTables;
    localeService;
    static fenceID = "579dc571d53a0658a154fbec";
    debugMessagePrefix = "[Late to the Party] ";
    translations;
    constructor(logger, databaseTables, localeService) {
        this.logger = logger;
        this.databaseTables = databaseTables;
        this.localeService = localeService;
        // Get all translations for the current locale
        this.translations = this.localeService.getLocaleDb();
    }
    logInfo(message, alwaysShow = false) {
        if (config_json_1.default.debug.enabled || alwaysShow)
            this.logger.info(this.debugMessagePrefix + message);
    }
    logWarning(message) {
        this.logger.warning(this.debugMessagePrefix + message);
    }
    logError(message) {
        this.logger.error(this.debugMessagePrefix + message);
    }
    getItemName(itemID) {
        const translationKey = `${itemID} Name`;
        if (translationKey in this.translations)
            return this.translations[translationKey];
        // If a key can't be found in the translations dictionary, fall back to the template data if possible
        if (!(itemID in this.databaseTables.templates.items)) {
            return undefined;
        }
        const item = this.databaseTables.templates.items[itemID];
        return item._name;
    }
    getMaxItemPrice(itemID) {
        // Get the handbook.json price, if any exists
        const matchingHandbookItems = this.databaseTables.templates.handbook.Items.filter((i) => i.Id === itemID);
        let handbookPrice = 0;
        if (matchingHandbookItems.length === 1) {
            handbookPrice = matchingHandbookItems[0].Price;
            // Some mods add a record with a junk value
            if ((handbookPrice == null) || Number.isNaN(handbookPrice)) {
                this.logWarning(`Invalid handbook price (${handbookPrice}) for ${this.getItemName(itemID)} (${itemID}). Defaulting to 0.`);
                handbookPrice = 0;
            }
        }
        // Get the prices.json price, if any exists
        let price = 0;
        if (itemID in this.databaseTables.templates.prices) {
            price = this.databaseTables.templates.prices[itemID];
            // Some mods add a record with a junk value
            if ((price == null) || Number.isNaN(price)) {
                // Only show a warning if the method will return 0
                if (handbookPrice === 0) {
                    this.logWarning(`Invalid price (${price}) for ${this.getItemName(itemID)} (${itemID}). Defaulting to 0.`);
                }
                price = 0;
            }
        }
        return Math.max(handbookPrice, price);
    }
    /**
     * Check if @param item is a child of the item with ID @param parentID
     */
    static hasParent(item, parentID, databaseTables) {
        const allParents = CommonUtils.getAllParents(item, databaseTables);
        return allParents.includes(parentID);
    }
    static getAllParents(item, databaseTables) {
        if ((item._parent === null) || (item._parent === undefined) || (item._parent === ""))
            return [];
        const allParents = CommonUtils.getAllParents(databaseTables.templates.items[item._parent], databaseTables);
        allParents.push(item._parent);
        return allParents;
    }
    static canItemDegrade(item, databaseTables) {
        if (item.upd === undefined) {
            return false;
        }
        if ((item.upd.MedKit === undefined) && (item.upd.Repairable === undefined) && (item.upd.Resource === undefined)) {
            return false;
        }
        const itemTpl = databaseTables.templates.items[item._tpl];
        if ((itemTpl._props.armorClass !== undefined) && (itemTpl._props.armorClass.toString() === "0")) {
            return false;
        }
        return true;
    }
    static interpolateForFirstCol(array, value) {
        if (array.length === 1) {
            return array[array.length - 1][1];
        }
        if (value <= array[0][0]) {
            return array[0][1];
        }
        for (let i = 1; i < array.length; i++) {
            if (array[i][0] >= value) {
                if (array[i][0] - array[i - 1][0] === 0) {
                    return array[i][1];
                }
                return array[i - 1][1] + (value - array[i - 1][0]) * (array[i][1] - array[i - 1][1]) / (array[i][0] - array[i - 1][0]);
            }
        }
        return array[array.length - 1][1];
    }
}
exports.CommonUtils = CommonUtils;
//# sourceMappingURL=CommonUtils.js.map