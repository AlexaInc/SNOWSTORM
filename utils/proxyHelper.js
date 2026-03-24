const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const http = require('node:http');
const https = require('node:https');
const { URL } = require('url');

/**
 * Centrally manages proxy agents for the entire application.
 * Ported from AlexaInc/alexatg — handles SOCKS, HTTP/HTTPS, and V2Ray/Xray sidecars.
 */
class ProxyHelper {
    constructor() {
        // Support both PROXY_URL (new) and HTTPS_PROXY/HTTP_PROXY/ALL_PROXY (legacy)
        this.proxyUrl = process.env.PROXY_URL
            || process.env.HTTPS_PROXY
            || process.env.HTTP_PROXY
            || process.env.ALL_PROXY;

        this.rejectUnauthorized = process.env.PROXY_REJECT_UNAUTHORIZED === 'true';
        this.timeout = parseInt(process.env.PROXY_TIMEOUT || '60000', 10);
        this.disableGlobal = process.env.PROXY_DISABLE_GLOBAL === 'true';

        // Build bypass list
        const defaultBypass = ['localhost', '127.0.0.1', '::1', '0.0.0.0', '.aivencloud.com'];
        const userBypass = (process.env.NO_PROXY || '').split(',').map(h => h.trim()).filter(Boolean);

        // Auto-bypass MongoDB hosts
        const mongoUrl = process.env.MONGO_URL || '';
        let dbHost = '';
        try {
            if (mongoUrl) dbHost = new URL(mongoUrl).hostname;
        } catch (e) { }

        this.noProxy = [...new Set([...defaultBypass, ...userBypass, ...(dbHost ? [dbHost] : [])])];

        // CRITICAL: Add proxy host itself to bypass to prevent infinite recursion
        if (this.proxyUrl) {
            try {
                const proxyHost = new URL(this.proxyUrl).hostname;
                if (!this.noProxy.some(h => h.trim() === proxyHost)) {
                    this.noProxy.push(proxyHost);
                }
            } catch (e) {
                console.error('⚠️ Could not parse PROXY_URL for bypass:', e.message);
            }
        }

        if (this.proxyUrl) {
            console.log(`ℹ️ Proxy System: rejectUnauthorized=${this.rejectUnauthorized}, timeout=${this.timeout}`);
            console.log(`ℹ️ Proxy Bypass: ${this.noProxy.join(', ')}`);
        }

        this.agent = this._createAgent();
    }

    _createAgent() {
        if (!this.proxyUrl) return null;

        let finalProxyUrl = this.proxyUrl;

        // V2Ray/Xray sidecar auto-redirect
        const supportedProtocols = ['vmess://', 'vless://', 'ss://', 'trojan://'];
        const isSupported = supportedProtocols.some(p => finalProxyUrl.startsWith(p));
        const isLocalSidecar = finalProxyUrl.includes('127.0.0.1:10808');

        if (isSupported && !isLocalSidecar) {
            console.log(`🚀 Proxy: V2Ray protocol detected → routing via local Xray sidecar (127.0.0.1:10808)`);
            finalProxyUrl = 'socks5h://127.0.0.1:10808';
        }

        const options = {
            keepAlive: true,
            timeout: this.timeout,
            rejectUnauthorized: false,
        };

        if (finalProxyUrl.startsWith('socks')) {
            console.log(`🚀 Proxy: SOCKS agent → ${finalProxyUrl.split('@').pop()}`);
            return new SocksProxyAgent(finalProxyUrl, options);
        } else {
            console.log(`🚀 Proxy: HTTPS agent → ${finalProxyUrl.split('@').pop()}`);
            return new HttpsProxyAgent(finalProxyUrl, options);
        }
    }

    /**
     * Checks if a URL should bypass the proxy.
     */
    shouldBypass(urlStr) {
        if (!urlStr) return true;
        try {
            const url = new URL(urlStr);
            const hostname = url.hostname.toLowerCase();

            return this.noProxy.some(host => {
                const h = host.trim().toLowerCase();
                if (!h) return false;
                if (hostname === h) return true;
                if (h.startsWith('.') && hostname.endsWith(h)) return true;
                if (h.includes('.') && hostname.includes(h)) return true;
                return false;
            });
        } catch (e) {
            return true;
        }
    }

    /**
     * Returns the appropriate agent for a given URL (null if bypassed).
     */
    getAgent(urlStr) {
        if (!this.agent) return null;
        if (this.shouldBypass(urlStr)) return null;
        return this.agent;
    }

    /**
     * Configures global Axios interceptor to route through proxy.
     */
    configureAxios() {
        if (!this.agent) return;

        try {
            const axios = require('axios');
            axios.interceptors.request.use((config) => {
                const agent = this.getAgent(config.url);
                if (agent) {
                    config.httpAgent = agent;
                    config.httpsAgent = agent;
                }
                return config;
            });
            console.log('✅ Global Axios Proxy configured');
        } catch (e) {
            // axios not installed — skip silently
        }
    }

    /**
     * Overrides global http.request and https.request to route through proxy.
     */
    configureGlobal() {
        if (!this.agent || this.disableGlobal) {
            if (this.disableGlobal) console.log('ℹ️ Global Proxy override DISABLED via PROXY_DISABLE_GLOBAL');
            return;
        }

        const agent = this.agent;
        const originalHttpRequest = http.request;
        const originalHttpsRequest = https.request;

        const wrapRequest = (originalFn, defaultProtocol) => {
            return (options, ...args) => {
                let urlObj;
                let requestOptions;

                if (typeof options === 'string') {
                    urlObj = new URL(options);
                    requestOptions = {
                        protocol: urlObj.protocol,
                        hostname: urlObj.hostname,
                        port: urlObj.port,
                        path: urlObj.pathname + urlObj.search,
                        hash: urlObj.hash,
                    };
                } else if (options instanceof URL) {
                    urlObj = options;
                    requestOptions = {
                        protocol: urlObj.protocol,
                        hostname: urlObj.hostname,
                        port: urlObj.port,
                        path: urlObj.pathname + urlObj.search,
                    };
                } else {
                    requestOptions = { ...options };
                    const protocol = requestOptions.protocol || defaultProtocol;
                    const host = requestOptions.hostname || requestOptions.host || 'localhost';
                    const path = requestOptions.path || '';
                    try {
                        urlObj = new URL(`${protocol}//${host}${path}`);
                    } catch (e) {
                        return originalFn.call(null, options, ...args);
                    }
                }

                if (!this.shouldBypass(urlObj.href)) {
                    requestOptions.agent = agent;
                }

                return originalFn.call(null, requestOptions, ...args);
            };
        };

        http.request = wrapRequest(originalHttpRequest, 'http:');
        https.request = wrapRequest(originalHttpsRequest, 'https:');

        console.log('✅ Global Node.js Proxy (HTTP/HTTPS) configured');
    }
}

module.exports = new ProxyHelper();
