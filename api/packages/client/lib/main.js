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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrderInfo = void 0;
const nearApi = __importStar(require("near-api-js"));
const tonic_1 = require("@tonic-foundation/tonic");
const config_1 = require("@tonic-foundation/config");
const _1 = require(".");
function getOrderInfo(tonic, indexer, id) {
    return __awaiter(this, void 0, void 0, function* () {
        const indexedOrder = yield indexer.getOrder(id);
        if (!indexedOrder) {
            return null;
        }
        const openOrder = yield tonic.getOrder(indexedOrder.market_id, id);
        return Object.assign(Object.assign({}, indexedOrder), { openOrder });
    });
}
exports.getOrderInfo = getOrderInfo;
(() => __awaiter(void 0, void 0, void 0, function* () {
    var e_1, _a;
    const indexer = new _1.TonicIndexer('https://data-api.mainnet.tonic.foundation');
    const near = new nearApi.Near(Object.assign(Object.assign({}, (0, config_1.getNearConfig)('mainnet')), { keyStore: new nearApi.keyStores.InMemoryKeyStore() }));
    const viewer = yield near.account('');
    const tonic = new tonic_1.Tonic(viewer, 'v1.orderbook.near');
    console.log('getting order status');
    try {
        console.log('existing', yield getOrderInfo(tonic, indexer, 'GokLUshoFuhinvDmmxpSew'));
        console.log('nonexistent', yield getOrderInfo(tonic, indexer, 'fake'));
    }
    catch (e) {
        console.info(e);
    }
    const markets = yield indexer.markets();
    console.log('getting trade stream for market', markets[0].symbol);
    const [stream, stop] = indexer.recentTradeStream(markets[0].id);
    setTimeout(stop, 10000);
    try {
        for (var stream_1 = __asyncValues(stream), stream_1_1; stream_1_1 = yield stream_1.next(), !stream_1_1.done;) {
            const trade = stream_1_1.value;
            console.log(trade);
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (stream_1_1 && !stream_1_1.done && (_a = stream_1.return)) yield _a.call(stream_1);
        }
        finally { if (e_1) throw e_1.error; }
    }
    console.log('stopped');
}))();
//# sourceMappingURL=main.js.map