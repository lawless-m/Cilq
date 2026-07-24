(function() {
    // Override before this script loads via window.__BRIDGE_URL / window.__BRIDGE_TOKEN.
    const BRIDGE_WS = window.__BRIDGE_URL || 'wss://dw.ramsden-international.com/bridge/ws';
    const BRIDGE_TOKEN = window.__BRIDGE_TOKEN || 'BRIDGE';
    let ws = null;
    const connectionId = 'proxy_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    // Store last result for polling
    window.__bridgeLastResult = null;
    window.__bridgeResults = [];

    // window.bridge — the page/agent contract. Pages tag elements with
    // data-bridge-node="name" and/or register named actions; agent scripts then
    // address them by stable name instead of brittle selectors, and can
    // enumerate what a page exposes via nodes()/actions().
    window.bridge = (function() {
        const actions = {};
        function sel(name) {
            return '[data-bridge-node="' + String(name).replace(/"/g, '\\"') + '"]';
        }
        return {
            // The element tagged data-bridge-node="name" (or null).
            node: function(name) { return document.querySelector(sel(name)); },
            // Every element tagged data-bridge-node="name".
            all: function(name) { return Array.prototype.slice.call(document.querySelectorAll(sel(name))); },
            // Enumerate the page's declared nodes — its contract for agents.
            nodes: function() {
                return Array.prototype.map.call(document.querySelectorAll('[data-bridge-node]'), function(el) {
                    return {
                        node: el.dataset.bridgeNode,
                        tag: el.tagName.toLowerCase(),
                        text: (el.textContent || '').trim().substring(0, 100),
                        value: ('value' in el) ? el.value : undefined
                    };
                });
            },
            // Page-side: register a named action the agent can invoke.
            register: function(name, fn) { actions[name] = fn; return name; },
            // Invoke a registered action; returns its result (may be a Promise).
            action: function(name) {
                if (typeof actions[name] !== 'function') throw new Error('No bridge action: ' + name);
                return actions[name].apply(null, Array.prototype.slice.call(arguments, 1));
            },
            // List registered action names — the action half of the contract.
            actions: function() { return Object.keys(actions); }
        };
    })();

    function fmt(arg) {
        if (typeof arg === 'object' && arg !== null) {
            try { return JSON.stringify(arg); } catch (e) { return String(arg); }
        }
        return String(arg);
    }

    // Turn an eval result into a JSON-safe { type, value } so the agent gets
    // the value AND knows what it is, instead of a lossy String().
    function serializeResult(value) {
        if (value === null) return { type: 'null', value: null };
        const t = typeof value;
        if (t === 'string' || t === 'number' || t === 'boolean') return { type: t, value: value };
        if (t === 'undefined') return { type: 'undefined', value: null };
        if (t === 'bigint' || t === 'symbol') return { type: t, value: String(value) };
        if (t === 'function') return { type: 'function', value: String(value) };
        if (typeof Promise !== 'undefined' && value instanceof Promise) {
            return { type: 'promise', value: null, note: 'result was an unresolved Promise (e.g. nested inside the returned value)' };
        }
        if (typeof Element !== 'undefined' && value instanceof Element) {
            return { type: 'element', value: value.outerHTML.substring(0, 5000) };
        }
        try {
            return { type: Array.isArray(value) ? 'array' : 'object', value: JSON.parse(JSON.stringify(value)) };
        } catch (e) {
            return { type: t, value: String(value), note: 'value is not JSON-serializable' };
        }
    }

    const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;

    // Compile the job. Try expression mode first ("return (script)") so bare
    // expressions and top-level await both work; fall back to body mode for
    // multi-statement scripts that supply their own return.
    function compile(script) {
        try {
            return new AsyncFunction('return (' + script + '\n);');
        } catch (e) {
            return new AsyncFunction(script);
        }
    }

    // Run a job, capturing console output and structuring the outcome.
    // Async: awaits the script's result so fetch/async jobs resolve.
    async function executeScript(script, requestId) {
        const logs = [];
        const levels = ['log', 'info', 'warn', 'error', 'debug'];
        const original = {};
        levels.forEach(function(level) {
            original[level] = console[level];
            console[level] = function() {
                logs.push({ level: level, message: Array.prototype.map.call(arguments, fmt).join(' ') });
                original[level].apply(console, arguments);
            };
        });
        let response;
        try {
            const ser = serializeResult(await compile(script)());
            response = {
                type: 'script_result', requestId: requestId, success: true,
                result: ser.value, resultType: ser.type, error: null, stack: null,
                logs: logs, timestamp: Date.now()
            };
            if (ser.note) response.note = ser.note;
        } catch (e) {
            response = {
                type: 'script_result', requestId: requestId, success: false,
                result: null, resultType: null, error: e.message, stack: e.stack || null,
                logs: logs, timestamp: Date.now()
            };
        } finally {
            levels.forEach(function(level) { console[level] = original[level]; });
        }
        return response;
    }

    function connect() {
        let url = BRIDGE_WS + '?connectionId=' + encodeURIComponent(connectionId);
        if (BRIDGE_TOKEN) url += '&token=' + encodeURIComponent(BRIDGE_TOKEN);
        ws = new WebSocket(url);

        ws.onopen = function() {
            console.log('[Bridge] Connected to Browser Bridge');
            ws.send(JSON.stringify({
                type: 'connection_established',
                timestamp: Date.now(),
                userAgent: navigator.userAgent,
                url: location.href,
                host: location.hostname,
                path: location.pathname,
                title: document.title
            }));
        };

        ws.onmessage = function(event) {
            try {
                const msg = JSON.parse(event.data);

                // Handle both lowercase and uppercase property names
                const msgType = msg.type || msg.Type;
                if (msgType === 'execute_script') {
                    const requestId = msg.requestId || msg.RequestId;
                    const script = msg.script || msg.Script;
                    executeScript(script, requestId).then(function(response) {
                        window.__bridgeLastResult = response;
                        window.__bridgeResults.push(response);
                        if (window.__bridgeResults.length > 20) window.__bridgeResults.shift();
                        ws.send(JSON.stringify(response));
                    });
                } else if (msgType === 'inspect_element') {
                    const selector = msg.selector || msg.Selector;
                    const requestId = msg.requestId || msg.RequestId;
                    try {
                        const el = document.querySelector(selector);
                        if (!el) {
                            throw new Error('Element not found: ' + selector);
                        }
                        const styles = window.getComputedStyle(el);
                        const rect = el.getBoundingClientRect();
                        const result = {
                            tagName: el.tagName,
                            id: el.id,
                            className: el.className,
                            innerHTML: el.innerHTML.substring(0, 500),
                            outerHTML: el.outerHTML.substring(0, 1000),
                            value: el.value,
                            styles: {
                                display: styles.display,
                                visibility: styles.visibility,
                                opacity: styles.opacity,
                                width: styles.width,
                                height: styles.height
                            },
                            rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
                        };
                        const response = {
                            type: 'inspect_result',
                            requestId: requestId,
                            success: true,
                            result: result,
                            timestamp: Date.now()
                        };
                        window.__bridgeLastResult = response;
                        window.__bridgeResults.push(response);
                        if (window.__bridgeResults.length > 20) window.__bridgeResults.shift();
                        ws.send(JSON.stringify({
                            type: 'console_log',
                            level: 'info',
                            message: 'INSPECT[' + requestId + ']: ' + JSON.stringify(result),
                            timestamp: Date.now()
                        }));
                        ws.send(JSON.stringify(response));
                    } catch (e) {
                        const response = {
                            type: 'inspect_result',
                            requestId: requestId,
                            success: false,
                            error: e.message,
                            timestamp: Date.now()
                        };
                        window.__bridgeLastResult = response;
                        window.__bridgeResults.push(response);
                        if (window.__bridgeResults.length > 20) window.__bridgeResults.shift();
                        ws.send(JSON.stringify({
                            type: 'console_log',
                            level: 'error',
                            message: 'INSPECT_ERROR[' + requestId + ']: ' + e.message,
                            timestamp: Date.now()
                        }));
                        ws.send(JSON.stringify(response));
                    }
                }
            } catch (e) {
                console.error('[Bridge] Message error:', e);
            }
        };

        ws.onerror = function(error) {
            console.error('[Bridge] WebSocket error:', error);
        };

        ws.onclose = function() {
            console.log('[Bridge] Disconnected, reconnecting in 5s...');
            setTimeout(connect, 5000);
        };
    }

    connect();
})();
