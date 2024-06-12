"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotConversionHelper = void 0;
const config_json_1 = __importDefault(require("../config/config.json"));
const CommonUtils_1 = require("./CommonUtils");
class BotConversionHelper {
    // All variables should be static because there should only be one instance of this object
    static escapeTime;
    static simulatedTimeRemaining;
    static commonUtils;
    static iPmcConfig;
    static timerHandle;
    static timerRunning;
    static convertIntoPmcChanceOrig = {};
    constructor(commonUtils, iPmcConfig) {
        BotConversionHelper.commonUtils = commonUtils;
        BotConversionHelper.iPmcConfig = iPmcConfig;
        // Store the values in iBotConfig as default settings
        this.setOriginalData();
    }
    setEscapeTime(escapeTime, timeRemaining) {
        // Ensure the instance of this object is valid
        if (!this.checkIfInitialized()) {
            BotConversionHelper.commonUtils.logError("BotConversionHelper object not initialized!");
            return;
        }
        BotConversionHelper.escapeTime = escapeTime;
        BotConversionHelper.simulatedTimeRemaining = timeRemaining;
        // Ensure there isn't already a timer running
        if (!BotConversionHelper.timerRunning && config_json_1.default.adjust_bot_spawn_chances.adjust_pmc_conversion_chances) {
            // Start a recurring task to update bot spawn settings
            BotConversionHelper.timerHandle = setInterval(BotConversionHelper.simulateRaidTime, 1000 * config_json_1.default.adjust_bot_spawn_chances.pmc_conversion_update_rate);
        }
        BotConversionHelper.commonUtils.logInfo("Updated escape time");
    }
    static stopRaidTimer() {
        if (!config_json_1.default.adjust_bot_spawn_chances.adjust_pmc_conversion_chances) {
            return;
        }
        // Stop the recurring task
        clearInterval(BotConversionHelper.timerHandle);
        BotConversionHelper.timerRunning = false;
        // Reset the PMC-conversion chances to their original settings
        BotConversionHelper.adjustPmcConversionChance(1);
        BotConversionHelper.commonUtils.logInfo("Stopped task for adjusting PMC-conversion chances.");
    }
    static adjustPmcConversionChance(timeRemainingFactor) {
        // Determine the factor that should be applied to the PMC-conversion chances based on the config.json setting
        const adjFactor = CommonUtils_1.CommonUtils.interpolateForFirstCol(config_json_1.default.pmc_spawn_chance_multipliers, timeRemainingFactor);
        // Adjust the chances for each applicable bot type
        let logMessage = "";
        for (const pmcType in BotConversionHelper.iPmcConfig.convertIntoPmcChance) {
            // Do not allow the chances to exceed 100%. Who knows what might happen...
            const min = Math.round(Math.min(100, BotConversionHelper.convertIntoPmcChanceOrig[pmcType].min * adjFactor));
            const max = Math.round(Math.min(100, BotConversionHelper.convertIntoPmcChanceOrig[pmcType].max * adjFactor));
            BotConversionHelper.iPmcConfig.convertIntoPmcChance[pmcType].min = min;
            BotConversionHelper.iPmcConfig.convertIntoPmcChance[pmcType].max = max;
            logMessage += `${pmcType}: ${min}-${max}%, `;
        }
        BotConversionHelper.commonUtils.logInfo(`Adjusting PMC spawn chances (${adjFactor}): ${logMessage}`);
    }
    checkIfInitialized() {
        if (BotConversionHelper.commonUtils === undefined) {
            return false;
        }
        if (BotConversionHelper.iPmcConfig === undefined) {
            return false;
        }
        return true;
    }
    setOriginalData() {
        // Store the default PMC-conversion chances for each bot type defined in SPT's configuration file
        let logMessage = "";
        for (const pmcType in BotConversionHelper.iPmcConfig.convertIntoPmcChance) {
            if (BotConversionHelper.convertIntoPmcChanceOrig[pmcType] !== undefined) {
                logMessage += `${pmcType}: already buffered, `;
                continue;
            }
            const chances = {
                min: BotConversionHelper.iPmcConfig.convertIntoPmcChance[pmcType].min,
                max: BotConversionHelper.iPmcConfig.convertIntoPmcChance[pmcType].max
            };
            BotConversionHelper.convertIntoPmcChanceOrig[pmcType] = chances;
            logMessage += `${pmcType}: ${chances.min}-${chances.max}%, `;
        }
        BotConversionHelper.commonUtils.logInfo(`Reading default PMC spawn chances: ${logMessage}`);
    }
    static simulateRaidTime() {
        BotConversionHelper.timerRunning = true;
        // Adjust the PMC-conversion chances once per cycle
        const timeFactor = BotConversionHelper.simulatedTimeRemaining / BotConversionHelper.escapeTime;
        BotConversionHelper.adjustPmcConversionChance(timeFactor);
        // Decrement the simulated raid time to prepare for the next cycle
        BotConversionHelper.simulatedTimeRemaining -= config_json_1.default.adjust_bot_spawn_chances.pmc_conversion_update_rate;
    }
}
exports.BotConversionHelper = BotConversionHelper;
//# sourceMappingURL=BotConversionHelper.js.map