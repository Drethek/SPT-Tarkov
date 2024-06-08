"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.savePityTrackerDatabase = exports.updatePityTracker = exports.loadPityTrackerDatabase = exports.maybeCreatePityTrackerDatabase = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const QuestStatus_1 = require("C:/snapshot/project/obj/models/enums/QuestStatus");
const databaseDir = path_1.default.resolve(__dirname, "../database/");
const pityTrackerPath = path_1.default.join(databaseDir, "pityTracker.json");
function maybeCreatePityTrackerDatabase() {
    if (!fs_1.default.existsSync(databaseDir)) {
        fs_1.default.mkdirSync(databaseDir, { recursive: true });
    }
    if (!fs_1.default.existsSync(pityTrackerPath)) {
        const emptyTracker = {
            hideout: {},
            quests: {},
        };
        savePityTrackerDatabase(emptyTracker);
    }
}
exports.maybeCreatePityTrackerDatabase = maybeCreatePityTrackerDatabase;
function loadPityTrackerDatabase() {
    return JSON.parse(fs_1.default.readFileSync(pityTrackerPath, "ascii"));
}
exports.loadPityTrackerDatabase = loadPityTrackerDatabase;
// TODO: probably should support multiple profiles
function updatePityTracker(profile, hideoutUpgrades, incrementRaidCount) {
    const raidCountIncrease = incrementRaidCount ? 1 : 0;
    const pityTracker = loadPityTrackerDatabase();
    const newQuestTracker = {};
    for (const questStatus of profile.characters.pmc.Quests) {
        if (questStatus.status === QuestStatus_1.QuestStatus.Started) {
            const oldStatus = pityTracker.quests[questStatus.qid];
            newQuestTracker[questStatus.qid] = {
                raidsSinceStarted: (oldStatus?.raidsSinceStarted ?? 0) + raidCountIncrease,
            };
        }
    }
    const newHideoutTracker = {};
    for (const possibleUpgrade of hideoutUpgrades) {
        const oldStatus = pityTracker.hideout[possibleUpgrade.area] ?? {
            currentLevel: 0,
            raidsSinceStarted: 0,
            timeAvailable: Date.now(),
        };
        // if the next upgrade is higher than what we've tracked, that means we upgraded and should reset it
        if (possibleUpgrade.level > oldStatus.currentLevel) {
            newHideoutTracker[possibleUpgrade.area] = {
                currentLevel: possibleUpgrade.level,
                raidsSinceStarted: raidCountIncrease,
                timeAvailable: Date.now(),
            };
        }
        else {
            newHideoutTracker[possibleUpgrade.area] = {
                ...oldStatus,
                raidsSinceStarted: oldStatus.raidsSinceStarted + raidCountIncrease,
            };
        }
    }
    savePityTrackerDatabase({
        hideout: newHideoutTracker,
        quests: newQuestTracker,
    });
}
exports.updatePityTracker = updatePityTracker;
function savePityTrackerDatabase(pityTracker) {
    fs_1.default.writeFileSync(pityTrackerPath, JSON.stringify(pityTracker, null, 2));
}
exports.savePityTrackerDatabase = savePityTrackerDatabase;
//# sourceMappingURL=DatabaseUtils.js.map