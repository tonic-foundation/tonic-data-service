"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i;
    function verb(n) { if (g[n]) i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TonicIndexer = void 0;
const axios_1 = __importDefault(require("axios"));
const bn_js_1 = __importDefault(require("bn.js"));
const date_fns_1 = require("date-fns");
// TODO: refactor
const REQUESTED_WITH = 'tonic-js-sdk';
const apiPrefix = {
    1: 'api/v1',
};
class TonicIndexer {
    constructor(baseUrl, version = 1) {
        this.version = version;
        if (!(baseUrl.startsWith('http://') || baseUrl.startsWith('https://'))) {
            throw new Error(`Tonic API base URL should be http(s) protocol`);
        }
        const stripped = baseUrl.replace(/\/+$/, ''); // remove trailing slash
        this._baseUrl = `${stripped}/${apiPrefix[version]}`;
        this._client = axios_1.default.create({
            baseURL: this._baseUrl,
            timeout: 10 * 1000,
            headers: { 'X-Requested-With': REQUESTED_WITH },
            validateStatus: (status) => {
                return (status >= 200 && status < 300) || status === 404;
            },
        });
    }
    /**
     * Return a market's latest trade price, latest trade price at least 24h
     * previous, and 24h high, low, and _base_ volume.
     */
    markets() {
        return __awaiter(this, void 0, void 0, function* () {
            const { data } = yield this._client.get('markets');
            return data.markets;
        });
    }
    /**
     * Return list of tokens used in markets supported by the API.
     */
    tokens() {
        return __awaiter(this, void 0, void 0, function* () {
            const { data } = yield this._client.get('tokens');
            return data.tokens;
        });
    }
    /**
     * Return a market's latest trade price, latest trade price at least 24h
     * previous, and 24h high, low, and base volume.
     */
    marketStats(market) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data } = yield this._client.get('stats', {
                params: {
                    market,
                },
            });
            return Object.assign(Object.assign({}, data.stats), { quantity: data.stats.quantity || 0 });
        });
    }
    /**
     * Return recent trades by market ID.
     *
     * @param market market ID
     * @param limit max number of records to return
     * @param after optional time to fetch from
     */
    recentTrades(market, limit = 100, after) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data } = yield this._client.get('recent-trades', {
                params: {
                    market,
                    limit,
                    after: after === null || after === void 0 ? void 0 : after.toISOString(),
                },
            });
            return data.trades.map((t) => {
                return {
                    price: new bn_js_1.default(t.fill_price),
                    quantity: new bn_js_1.default(t.fill_qty),
                    timestamp: new Date(t.created_at),
                };
            });
        });
    }
    /**
     * Return an async generator of recent trades.
     *
     * @param market market ID
     * @param from optional time to prefill data from
     * @returns Trade stream as an asynv generator and a cancel function to stop streaming
     */
    recentTradeStream(market, from, _opts = { batchSize: 40, interval: 5000 }) {
        const { batchSize, interval } = _opts;
        let stopped = false;
        function stop() {
            stopped = true;
        }
        function generator(client) {
            return __asyncGenerator(this, arguments, function* generator_1() {
                let prev = from || new Date();
                while (true) {
                    if (stopped) {
                        return yield __await(void 0);
                    }
                    try {
                        const trades = yield __await(client.recentTrades(market, batchSize, prev));
                        if (trades.length) {
                            prev = (0, date_fns_1.addSeconds)(trades.slice(-1)[0].timestamp, 1);
                        }
                        for (const trade of trades) {
                            yield yield __await(trade);
                        }
                    }
                    catch (e) {
                        console.info(e);
                    }
                    // TODO(renthog:websockets): remove
                    yield __await(new Promise((resolve) => setTimeout(resolve, interval)));
                }
            });
        }
        return [generator(this), stop];
    }
    /**
     * Return recent trades by market ID.
     *
     * @param market market ID
     * @param account account ID
     * @param limit max number of records to return
     * @param after optional timestamp to fetch from
     */
    tradeHistory(market, account, limit = 100, after) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data } = yield this._client.get('trade-history', {
                params: {
                    account,
                    market,
                    limit,
                    after: after === null || after === void 0 ? void 0 : after.toISOString(),
                },
            });
            return data.trades.map((t) => {
                return Object.assign(Object.assign({}, t), { created_at: new Date(t.created_at) });
            });
        });
    }
    getOrder(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const resp = yield this._client.get('order', {
                params: { id },
            });
            if (resp.status >= 400 && resp.status < 500) {
                return null;
            }
            return resp.data;
        });
    }
}
exports.TonicIndexer = TonicIndexer;
//# sourceMappingURL=index.js.map