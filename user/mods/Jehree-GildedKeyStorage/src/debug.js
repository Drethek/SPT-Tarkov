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
exports.Debug = void 0;
/* eslint-disable @typescript-eslint/brace-style */
const config = __importStar(require("../config/config.json"));
const LogTextColor_1 = require("C:/snapshot/project/obj/models/spt/logging/LogTextColor");
const BaseClasses_1 = require("C:/snapshot/project/obj/models/enums/BaseClasses");
const debugConfig = config.debug;
const keysInConfig = [
    ...config["Golden Keycard Case"].slot_ids,
    ...config["Golden Keychain Mk. I"].slot_ids,
    ...config["Golden Keychain Mk. II"].slot_ids,
    ...config["Golden Keychain Mk. III"].slot_ids
];
class Debug {
    logMissingKeys(logger, itemHelper, dbItems, dbLocales) {
        if (!debugConfig.log_missing_keys)
            return;
        logger.log("[Gilded Key Storage]: Keys missing from config: ", LogTextColor_1.LogTextColor.MAGENTA);
        logger.log("-------------------------------------------", LogTextColor_1.LogTextColor.YELLOW);
        for (const itemID in dbItems) {
            const thisItem = dbItems[itemID];
            // Skip items that aren't items
            if (thisItem._type !== "Item")
                continue;
            // Skip non-keys
            if (!itemHelper.isOfBaseclass(thisItem._id, BaseClasses_1.BaseClasses.KEY))
                continue;
            // Skip quest keys
            if (thisItem._props.QuestItem)
                continue;
            if (this.isKeyMissing(itemID)) {
                logger.log(dbLocales[`${itemID} Name`], LogTextColor_1.LogTextColor.MAGENTA);
                logger.log(itemID, LogTextColor_1.LogTextColor.MAGENTA);
                logger.log("-------------------------------------------", LogTextColor_1.LogTextColor.YELLOW);
            }
        }
    }
    isKeyMissing(keyId) {
        if (keysInConfig.includes(keyId)) {
            return false;
        }
        return true;
    }
    giveProfileAllKeysAndGildedCases(staticRouterModService, saveServer, logger) {
        if (!debugConfig.give_profile_all_keys)
            return;
        staticRouterModService.registerStaticRouter("On_Game_Start_Gilded_Key_Storage", [{
                url: "/client/game/start",
                action: (url, info, sessionId, output) => {
                    const profile = saveServer.getProfile(sessionId);
                    const profileInventory = profile.characters?.pmc?.Inventory;
                    if (!profileInventory) {
                        logger.log("New profile detected! load to stash, then close and reopen SPT to receive all keys and gilded cases", LogTextColor_1.LogTextColor.RED);
                        return output;
                    }
                    const itemIdsToPush = this.getArrayOfKeysAndCases();
                    let xVal = 0;
                    let yVal = 0;
                    for (let i = 0; i < itemIdsToPush.length; i++) {
                        const thisItemId = itemIdsToPush[i];
                        xVal++;
                        if (xVal > 9) {
                            xVal = 0;
                            yVal += 1;
                        }
                        profileInventory.items.push({
                            _id: `${thisItemId}_gilded_debug_id`,
                            _tpl: thisItemId,
                            parentId: profileInventory.stash,
                            slotId: "hideout",
                            location: {
                                x: xVal,
                                y: yVal,
                                r: "Horizontal",
                                isSearched: true
                            }
                        });
                        profile.characters.pmc.Encyclopedia[thisItemId] = true;
                    }
                    return output;
                }
            }], "aki");
    }
    removeAllDebugInstanceIdsFromProfile(staticRouterModService, saveServer) {
        if (!debugConfig.give_profile_all_keys && !debugConfig.force_remove_debug_items_on_start)
            return;
        let urlHook = "/client/game/logout";
        if (debugConfig.force_remove_debug_items_on_start) {
            urlHook = "/client/game/start";
        }
        staticRouterModService.registerStaticRouter("On_Logout_Gilded_Key_Storage", [{
                url: urlHook,
                action: (url, info, sessionId, output) => {
                    const profile = saveServer.getProfile(sessionId);
                    const profileInventory = profile.characters?.pmc?.Inventory;
                    const profileItems = profileInventory.items;
                    if (!profileInventory) {
                        return output;
                    }
                    for (let i = profileItems.length; i > 0; i--) {
                        const itemKey = i - 1;
                        if (profileItems[itemKey]._id.includes("_gilded_debug_id")) {
                            profileInventory.items.splice(itemKey, 1);
                        }
                    }
                    return output;
                }
            }], "aki");
    }
    getArrayOfKeysAndCases() {
        const keysAndCases = [
            ...keysInConfig,
            config["Golden Key Pouch"].id,
            config["Golden Keycard Case"].id,
            config["Golden Keychain Mk. I"].id,
            config["Golden Keychain Mk. II"].id,
            config["Golden Keychain Mk. III"].id
        ];
        for (let i = keysAndCases.length; i > 0; i--) {
            const top = i - 1;
            for (let x = keysAndCases.length; x > 0; x--) {
                const bottom = x - 1;
                if (top !== bottom) {
                    if (keysAndCases[top] === keysAndCases[bottom]) {
                        keysAndCases.splice(bottom, 1);
                    }
                }
            }
        }
        return keysAndCases;
    }
}
exports.Debug = Debug;
//# sourceMappingURL=debug.js.map