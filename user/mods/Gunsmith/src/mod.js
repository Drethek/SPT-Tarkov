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
const ConfigTypes_1 = require("C:/snapshot/project/obj/models/enums/ConfigTypes");
// New trader settings aamfac
const baseJson = __importStar(require("../db/base.json"));
const Traders_1 = require("C:/snapshot/project/obj/models/enums/Traders");
const presets = __importStar(require("../db/presets.json"));
class gunsmith {
    mod;
    logger;
    configServer;
    ragfairConfig;
    constructor() {
        this.mod = "gunsmith"; // Set name of mod so we can log it to console later
    }
    /**
     * Some work needs to be done prior to SPT code being loaded, registering the profile image + setting trader update time inside the trader config json
     * @param container Dependency container
     */
    preAkiLoad(container) {
        this.logger = container.resolve("WinstonLogger");
        this.logger.debug(`[${this.mod}] preAki Loading... `);
        const preAkiModLoader = container.resolve("PreAkiModLoader");
        const imageRouter = container.resolve("ImageRouter");
        const configServer = container.resolve("ConfigServer");
        const traderConfig = configServer.getConfig(ConfigTypes_1.ConfigTypes.TRADER);
        this.registerProfileImage(preAkiModLoader, imageRouter);
        this.setupTraderUpdateTime(traderConfig);
        // Add trader to trader enum
        Traders_1.Traders["gunsmith"] = "gunsmith";
        this.logger.debug(`[${this.mod}] preAki Loaded`);
    }
    /**
     * Majority of trader-related work occurs after the aki database has been loaded but prior to SPT code being run
     * @param container Dependency container
     */
    postDBLoad(container) {
        this.logger.debug(`[${this.mod}] postDb Loading... `);
        this.configServer = container.resolve("ConfigServer");
        this.ragfairConfig = this.configServer.getConfig(ConfigTypes_1.ConfigTypes.RAGFAIR);
        // Resolve SPT classes we'll use
        const databaseServer = container.resolve("DatabaseServer");
        const configServer = container.resolve("ConfigServer");
        const traderConfig = configServer.getConfig(ConfigTypes_1.ConfigTypes.TRADER);
        const jsonUtil = container.resolve("JsonUtil");
        // Get a reference to the database tables
        const tables = databaseServer.getTables();
        // Add new trader to the trader dictionary in DatabaseServer
        this.addTraderToDb(baseJson, tables, jsonUtil);
        this.addTraderToLocales(tables, baseJson.name, "gunsmith", baseJson.nickname, baseJson.location, "A distinguished gunsmith who smuggles some of the best weapons and equipment into Tarkov. Also he is excellent in repairing weapons and armor.");
        // Add item purchase threshold value (what % durability does trader stop buying items at)
        //        traderConfig.durabilityPurchaseThreshhold[baseJson._id] = 60;
        this.ragfairConfig.traders[baseJson._id] = true;
        this.logger.debug(`[${this.mod}] postDb Loaded`);
    }
    /**
     * Add profile picture to our trader
     * @param preAkiModLoader mod loader class - used to get the mods file path
     * @param imageRouter image router class - used to register the trader image path so we see their image on trader page
     */
    registerProfileImage(preAkiModLoader, imageRouter) {
        // Reference the mod "res" folder
        const imageFilepath = `./${preAkiModLoader.getModPath(this.mod)}res`;
        // Register a route to point to the profile picture
        imageRouter.addRoute(baseJson.avatar.replace(".png", ""), `${imageFilepath}/gunsmith.png`);
    }
    /**
     * Add record to trader config to set the refresh time of trader in seconds (default is 60 minutes)
     * @param traderConfig trader config to add our trader to
     */
    setupTraderUpdateTime(traderConfig) {
        // Add refresh time in seconds to config
        const traderRefreshRecord = {
            traderId: baseJson._id,
            seconds: { min: 1000, max: 6000 },
        };
        traderConfig.updateTime.push(traderRefreshRecord);
    }
    /**
     * Add our new trader to the database
     * @param traderDetailsToAdd trader details
     * @param tables database
     * @param jsonUtil json utility class
     */
    // rome-ignore lint/suspicious/noExplicitAny: traderDetailsToAdd comes from base.json, so no type
    addTraderToDb(traderDetailsToAdd, tables, jsonUtil) {
        // Add trader to trader table, key is the traders id
        tables.traders[traderDetailsToAdd._id] = {
            assort: this.generateAssort(),
            base: jsonUtil.deserialize(jsonUtil.serialize(traderDetailsToAdd)),
            questassort: {
                started: {},
                success: {},
                fail: {},
            }, // Empty object as trader has no assorts unlocked by quests
        };
    }
    generateAssort() {
        let assort = {
            nextResupply: 86400,
            items: [],
            barter_scheme: {},
            loyal_level_items: {},
        };
        if (!presets || Object.keys(presets).length === 0) {
            this.logger.error(`[${this.mod}] Presets are not defined or empty.`);
            return assort;
        }
        Object.values(presets).forEach((preset) => {
            if (!preset.items) {
                this.logger.error(`[${this.mod}] Preset items are not defined for preset: ${preset}`);
                return;
            }
            preset.items.forEach((item) => {
                if (item._id === preset.root) {
                    assort.items.push({
                        _id: item._id,
                        _tpl: item._tpl,
                        parentId: "hideout",
                        slotId: "hideout",
                        upd: {
                            UnlimitedCount: false,
                            StackObjectsCount: 1,
                        },
                    });
                }
                else {
                    assort.items.push({
                        _id: item._id,
                        _tpl: item._tpl,
                        parentId: item.parentId,
                        slotId: item.slotId,
                        upd: {
                            StackObjectsCount: 1,
                        },
                    });
                }
            });
            assort.barter_scheme[preset.root] = [
                [
                    {
                        count: preset.price,
                        _tpl: "5449016a4bdc2d6f028b456f",
                    },
                ],
            ];
            assort.loyal_level_items[preset.root] = 1;
        });
        return assort;
    }
    /**
     * Add traders name/location/description to the locale table
     * @param tables database tables
     * @param fullName fullname of trader
     * @param firstName first name of trader
     * @param nickName nickname of trader
     * @param location location of trader
     * @param description description of trader
     */
    addTraderToLocales(tables, fullName, firstName, nickName, location, description) {
        // For each language, add locale for the new trader
        const locales = Object.values(tables.locales.global);
        for (const locale of locales) {
            locale[`${baseJson._id} FullName`] = fullName;
            locale[`${baseJson._id} FirstName`] = firstName;
            locale[`${baseJson._id} Nickname`] = nickName;
            locale[`${baseJson._id} Location`] = location;
            locale[`${baseJson._id} Description`] = description;
        }
    }
    addItemToLocales(tables, itemTpl, name, shortName, Description) {
        // For each language, add locale for the new trader
        const locales = Object.values(tables.locales.global);
        for (const locale of locales) {
            locale[`${itemTpl} Name`] = name;
            locale[`${itemTpl} ShortName`] = shortName;
            locale[`${itemTpl} Description`] = Description;
        }
    }
}
module.exports = { mod: new gunsmith() };
//# sourceMappingURL=mod.js.map