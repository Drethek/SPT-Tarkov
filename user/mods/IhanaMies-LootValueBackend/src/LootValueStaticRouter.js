"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ConfigTypes_1 = require("C:/snapshot/project/obj/models/enums/ConfigTypes");
class Mod {
    itemHelper;
    offerService;
    tradeHelper;
    profileHelper;
    saveServer;
    priceService;
    ragfairConfig;
    logger;
    preAkiLoad(container) {
        const logger = container.resolve("WinstonLogger");
        this.logger = logger;
        const staticRouterModService = container.resolve("StaticRouterModService");
        //HELPERS
        this.itemHelper = container.resolve("ItemHelper");
        this.offerService = container.resolve("RagfairOfferService");
        this.tradeHelper = container.resolve("TradeHelper");
        this.profileHelper = container.resolve("ProfileHelper");
        this.saveServer = container.resolve("SaveServer");
        this.priceService = container.resolve("RagfairPriceService");
        const config = container.resolve("ConfigServer");
        this.ragfairConfig = config.getConfig(ConfigTypes_1.ConfigTypes.RAGFAIR);
        // Hook up a new static route
        staticRouterModService.registerStaticRouter("LootValueRoutes", [
            {
                url: "/LootValue/GetItemLowestFleaPrice",
                //info is the payload from client in json
                //output is the response back to client
                action: (url, info, sessionID, output) => {
                    return (JSON.stringify(this.getItemLowestFleaPrice(info.templateId)));
                }
            },
            {
                url: "/LootValue/SellItemToTrader",
                //info is the payload from client in json
                //output is the response back to client
                action: (url, info, sessionID, output) => {
                    let response = this.sellItemToTrader(sessionID, info.ItemId, info.TraderId, info.Price);
                    return (JSON.stringify(response));
                }
            }
        ], "custom-static-LootValueRoutes");
    }
    getItemLowestFleaPrice(templateId) {
        const singleItemPrice = this.getFleaSingleItemPriceForTemplate(templateId);
        if (singleItemPrice > 0)
            return Math.floor(singleItemPrice);
        return null;
    }
    getFleaSingleItemPriceForTemplate(templateId) {
        // https://dev.sp-tarkov.com/SPT/Server/src/branch/master/project/src/controllers/RagfairController.ts#L411
        // const name = this.itemHelper.getItemName(templateId);
        const offers = this.offerService.getOffersOfType(templateId);
        if (!offers || !offers.length)
            return null;
        const offersByPlayers = [...offers.filter(a => a.user.memberType != 4)];
        if (!offersByPlayers || !offersByPlayers.length)
            return null;
        let fleaPriceForItem = this.priceService.getFleaPriceForItem(templateId);
        //console.log(`Item ${name} price per unit: ${fleaPriceForItem}`);
        const itemPriceModifer = this.ragfairConfig.dynamic.itemPriceMultiplier[templateId];
        //console.log(`Item price modifier: ${itemPriceModifer || "No modifier in place"}`);
        if (itemPriceModifer)
            fleaPriceForItem *= itemPriceModifer;
        return fleaPriceForItem;
    }
    sellItemToTrader(sessionId, itemId, traderId, price) {
        let pmcData = this.profileHelper.getPmcProfile(sessionId);
        if (!pmcData) {
            this.logger.error("pmcData was null");
            return false;
        }
        let item = pmcData.Inventory.items.find(x => x._id === itemId);
        if (!item) {
            this.logger.error("item was null");
            return false;
        }
        let sellRequest = {
            Action: "sell_to_trader",
            type: "sell_to_trader",
            tid: traderId,
            price: price,
            items: [{
                    id: itemId,
                    count: item.upd ? item.upd.StackObjectsCount ? item.upd.StackObjectsCount : 1 : 1,
                    scheme_id: 0
                }]
        };
        let response = this.tradeHelper.sellItem(pmcData, pmcData, sellRequest, sessionId);
        this.saveServer.saveProfile(sessionId);
        return true;
    }
}
module.exports = { mod: new Mod() };
//# sourceMappingURL=LootValueStaticRouter.js.map