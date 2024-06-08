"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuestUtils = void 0;
const QuestStatus_1 = require("C:/snapshot/project/obj/models/enums/QuestStatus");
const DatabaseUtils_1 = require("./DatabaseUtils");
const config_json_1 = require("../config/config.json");
const questKeys_json_1 = __importDefault(require("../config/questKeys.json"));
const gunsmith_json_1 = __importDefault(require("../config/gunsmith.json"));
function isKnownQuest(questId, obj) {
    return questId in obj;
}
class QuestUtils {
    logger;
    constructor(logger) {
        this.logger = logger;
    }
    augmentQuestStatusesWithTrackingInfo(questStatuses) {
        const questTracker = (0, DatabaseUtils_1.loadPityTrackerDatabase)().quests;
        return questStatuses.map((questStatus) => ({
            ...questStatus,
            raidsSinceStarted: questTracker[questStatus.qid]?.raidsSinceStarted ?? 0,
        }));
    }
    getInProgressQuestRequirements(profile, quests) {
        // augment inProgress Quests with # of raids since accepted
        const inProgressQuests = this.augmentQuestStatusesWithTrackingInfo(profile.characters.pmc.Quests.filter((quest) => (quest.qid !== "5c51aac186f77432ea65c552" || !config_json_1.excludeCollector) &&
            quest.status === QuestStatus_1.QuestStatus.Started));
        // Find all quest conditions that are not completed
        return inProgressQuests.flatMap((quest) => this.getIncompleteConditionsForQuest(quests, quest));
    }
    getIncompleteConditionsForQuest(quests, questStatus) {
        const quest = quests[questStatus.qid];
        if (!quest) {
            return [];
        }
        // startTime can be 0 for some reason, and if so, try to pull off from statusTimers.
        const startTime = questStatus.startTime > 0
            ? questStatus.startTime
            : questStatus.statusTimers?.[QuestStatus_1.QuestStatus.Started];
        // startTime/statusTimes are in seconds, but Date.now() is in millis, so divide by 1000 first
        // If we couldn't find a start time, just assume 0 time has passed
        const secondsSinceStarted = startTime
            ? Math.round(Date.now() / 1000 - startTime)
            : 0;
        const completedConditions = questStatus.completedConditions ?? [];
        const itemConditions = quest.conditions.AvailableForFinish.filter((condition) => condition.conditionType === "HandoverItem" ||
            condition.conditionType === "LeaveItemAtLocation");
        const allQuestsTargets = new Set(quest.conditions.AvailableForFinish.flatMap((c) => Array.isArray(c.target) ? c.target : [c.target]));
        const missingItemConditions = itemConditions.filter((condition) => !completedConditions.includes(condition.id));
        const conditions = missingItemConditions.flatMap(({ target, onlyFoundInRaid, value, id }) => {
            if (!target || !value) {
                return [];
            }
            let targets;
            if (Array.isArray(target)) {
                targets = target;
            }
            else {
                targets = [target];
            }
            return targets.map((itemId) => ({
                type: "quest",
                conditionId: id,
                itemId: itemId,
                foundInRaid: onlyFoundInRaid ?? false,
                amountRequired: typeof value === "string" ? parseInt(value) : value,
                secondsSinceStarted,
                raidsSinceStarted: questStatus.raidsSinceStarted,
            }));
        });
        if (config_json_1.includeKeys && isKnownQuest(quest._id, questKeys_json_1.default)) {
            const keysForQuest = questKeys_json_1.default[quest._id];
            for (const keyForQuest of keysForQuest) {
                if (allQuestsTargets.has(keyForQuest)) {
                    config_json_1.debug &&
                        this.logger.info(`skipping quest key ${keyForQuest} because it's already a requirement of the quest ${quest.QuestName ?? quest._id}`);
                    continue;
                }
                conditions.push({
                    type: "questKey",
                    amountRequired: 1,
                    itemId: keyForQuest,
                    raidsSinceStarted: questStatus.raidsSinceStarted,
                    secondsSinceStarted,
                });
            }
        }
        if (config_json_1.includeGunsmith && isKnownQuest(quest._id, gunsmith_json_1.default)) {
            const gunsmithItems = gunsmith_json_1.default[quest._id] ?? [];
            for (const gunsmithItem of gunsmithItems) {
                conditions.push({
                    type: "gunsmith",
                    amountRequired: 1,
                    itemId: gunsmithItem,
                    raidsSinceStarted: questStatus.raidsSinceStarted,
                    secondsSinceStarted,
                });
            }
        }
        return conditions;
    }
}
exports.QuestUtils = QuestUtils;
//# sourceMappingURL=QuestUtils.js.map