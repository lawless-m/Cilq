(function() {
    const BRIDGE_WS = 'ws://localhost:3141/ws';
    let ws = null;
    const connectionId = 'proxy_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    // Store last result for polling
    window.__bridgeLastResult = null;
    window.__bridgeResults = [];

    function connect() {
        ws = new WebSocket(BRIDGE_WS + '?connectionId=' + connectionId);

        ws.onopen = function() {
            console.log('[Bridge] Connected to Browser Bridge');
            ws.send(JSON.stringify({
                type: 'connection_established',
                timestamp: Date.now(),
                userAgent: navigator.userAgent
            }));
        };

        ws.onmessage = function(event) {
            try {
                const msg = JSON.parse(event.data);

                // Handle both lowercase and uppercase property names
                const msgType = msg.type || msg.Type;
                if (msgType === 'execute_script') {
                    const requestId = msg.requestId || msg.RequestId;
                    try {
                        const script = msg.script || msg.Script;
                        const result = eval(script);
                        const resultStr = typeof result === 'object' ? JSON.stringify(result) : String(result);
                        const response = {
                            type: 'script_result',
                            requestId: requestId,
                            success: true,
                            result: resultStr,
                            timestamp: Date.now()
                        };
                        window.__bridgeLastResult = response;
                        window.__bridgeResults.push(response);
                        if (window.__bridgeResults.length > 20) window.__bridgeResults.shift();
                        // Also send as console_log for the server to capture
                        ws.send(JSON.stringify({
                            type: 'console_log',
                            level: 'info',
                            message: 'RESULT[' + requestId + ']: ' + resultStr,
                            timestamp: Date.now()
                        }));
                        ws.send(JSON.stringify(response));
                    } catch (e) {
                        const response = {
                            type: 'script_result',
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
                            message: 'ERROR[' + requestId + ']: ' + e.message,
                            timestamp: Date.now()
                        }));
                        ws.send(JSON.stringify(response));
                    }
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
