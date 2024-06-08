import { DependencyContainer } from "tsyringe";

// SPT types
import { IPreAkiLoadMod } from "@spt-aki/models/external/IPreAkiLoadMod";
import { IPostDBLoadMod } from "@spt-aki/models/external/IPostDBLoadMod";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { PreAkiModLoader } from "@spt-aki/loaders/PreAkiModLoader";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { ImageRouter } from "@spt-aki/routers/ImageRouter";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { ITraderAssort, ITraderBase } from "@spt-aki/models/eft/common/tables/ITrader";
import { ITraderConfig, UpdateTime } from "@spt-aki/models/spt/config/ITraderConfig";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { IDatabaseTables } from "@spt-aki/models/spt/server/IDatabaseTables";

// New trader settings aamfac
import * as baseJson from "../db/base.json";
import { Traders } from "@spt-aki/models/enums/Traders";
import * as assortJson from "../db/assort.json";
import * as presets from "../db/presets.json";

class gunsmith implements IPreAkiLoadMod, IPostDBLoadMod {
  mod: string;
  logger: ILogger;
  private configServer: ConfigServer;
  private ragfairConfig: IRagfairConfig;

  constructor() {
    this.mod = "gunsmith"; // Set name of mod so we can log it to console later
  }

  /**
   * Some work needs to be done prior to SPT code being loaded, registering the profile image + setting trader update time inside the trader config json
   * @param container Dependency container
   */
  public preAkiLoad(container: DependencyContainer): void {
    this.logger = container.resolve<ILogger>("WinstonLogger");
    this.logger.debug(`[${this.mod}] preAki Loading... `);

    const preAkiModLoader: PreAkiModLoader =
      container.resolve<PreAkiModLoader>("PreAkiModLoader");
    const imageRouter: ImageRouter = container.resolve<ImageRouter>("ImageRouter");
    const configServer = container.resolve<ConfigServer>("ConfigServer");
    const traderConfig: ITraderConfig = configServer.getConfig<ITraderConfig>(
      ConfigTypes.TRADER
    );

    this.registerProfileImage(preAkiModLoader, imageRouter);

    this.setupTraderUpdateTime(traderConfig);

    // Add trader to trader enum
    Traders["gunsmith"] = "gunsmith";
    this.logger.debug(`[${this.mod}] preAki Loaded`);
  }

  /**
   * Majority of trader-related work occurs after the aki database has been loaded but prior to SPT code being run
   * @param container Dependency container
   */
  public postDBLoad(container: DependencyContainer): void {
    this.logger.debug(`[${this.mod}] postDb Loading... `);

    this.configServer = container.resolve("ConfigServer");
    this.ragfairConfig = this.configServer.getConfig(ConfigTypes.RAGFAIR);

    // Resolve SPT classes we'll use
    const databaseServer: DatabaseServer =
      container.resolve<DatabaseServer>("DatabaseServer");
    const configServer: ConfigServer = container.resolve<ConfigServer>("ConfigServer");
    const traderConfig: ITraderConfig = configServer.getConfig(ConfigTypes.TRADER);
    const jsonUtil: JsonUtil = container.resolve<JsonUtil>("JsonUtil");

    // Get a reference to the database tables
    const tables = databaseServer.getTables();

    // Add new trader to the trader dictionary in DatabaseServer
    this.addTraderToDb(baseJson, tables, jsonUtil);

    this.addTraderToLocales(
      tables,
      baseJson.name,
      "gunsmith",
      baseJson.nickname,
      baseJson.location,
      "A distinguished gunsmith who smuggles some of the best weapons and equipment into Tarkov. Also he is excellent in repairing weapons and armor."
    );

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
  private registerProfileImage(
    preAkiModLoader: PreAkiModLoader,
    imageRouter: ImageRouter
  ): void {
    // Reference the mod "res" folder
    const imageFilepath = `./${preAkiModLoader.getModPath(this.mod)}res`;

    // Register a route to point to the profile picture
    imageRouter.addRoute(
      baseJson.avatar.replace(".png", ""),
      `${imageFilepath}/gunsmith.png`
    );
  }

  /**
   * Add record to trader config to set the refresh time of trader in seconds (default is 60 minutes)
   * @param traderConfig trader config to add our trader to
   */
  private setupTraderUpdateTime(traderConfig: ITraderConfig): void {
    // Add refresh time in seconds to config
    const traderRefreshRecord: UpdateTime = {
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
  private addTraderToDb(
    traderDetailsToAdd: any,
    tables: IDatabaseTables,
    jsonUtil: JsonUtil
  ): void {
    // Add trader to trader table, key is the traders id
    tables.traders[traderDetailsToAdd._id] = {
      assort: this.generateAssort(),
      base: jsonUtil.deserialize(jsonUtil.serialize(traderDetailsToAdd)) as ITraderBase,
      questassort: {
        started: {},
        success: {},
        fail: {},
      }, // Empty object as trader has no assorts unlocked by quests
    };
  }

  private generateAssort(): ITraderAssort {
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

    Object.values(presets).forEach((preset: any) => {
      if (!preset.items) {
        this.logger.error(
          `[${this.mod}] Preset items are not defined for preset: ${preset}`
        );
        return;
      }

      preset.items.forEach((item: any) => {
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
        } else {
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
  private addTraderToLocales(
    tables: IDatabaseTables,
    fullName: string,
    firstName: string,
    nickName: string,
    location: string,
    description: string
  ) {
    // For each language, add locale for the new trader
    const locales = Object.values(tables.locales.global) as Record<string, string>[];
    for (const locale of locales) {
      locale[`${baseJson._id} FullName`] = fullName;
      locale[`${baseJson._id} FirstName`] = firstName;
      locale[`${baseJson._id} Nickname`] = nickName;
      locale[`${baseJson._id} Location`] = location;
      locale[`${baseJson._id} Description`] = description;
    }
  }

  private addItemToLocales(
    tables: IDatabaseTables,
    itemTpl: string,
    name: string,
    shortName: string,
    Description: string
  ) {
    // For each language, add locale for the new trader
    const locales = Object.values(tables.locales.global) as Record<string, string>[];
    for (const locale of locales) {
      locale[`${itemTpl} Name`] = name;
      locale[`${itemTpl} ShortName`] = shortName;
      locale[`${itemTpl} Description`] = Description;
    }
  }
}

module.exports = { mod: new gunsmith() };
