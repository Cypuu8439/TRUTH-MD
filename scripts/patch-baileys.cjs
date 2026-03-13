const fs = require('fs');
const path = require('path');

const SOCKET_FILE = path.join(__dirname, '..', 'node_modules', '@whiskeysockets', 'baileys', 'lib', 'Socket', 'socket.js');
const CHATS_FILE = path.join(__dirname, '..', 'node_modules', '@whiskeysockets', 'baileys', 'lib', 'Socket', 'chats.js');
const MESSAGES_RECV_FILE = path.join(__dirname, '..', 'node_modules', '@whiskeysockets', 'baileys', 'lib', 'Socket', 'messages-recv.js');

function patchSocket() {
    if (!fs.existsSync(SOCKET_FILE)) { console.log('[patch-baileys] socket.js not found, skipping'); return; }
    let code = fs.readFileSync(SOCKET_FILE, 'utf-8');

    if (code.includes('// [PATCHED] event buffer disabled')) {
        console.log('[patch-baileys] socket.js already patched');
        return;
    }

    let patched = false;

    const bufferBlock = /if \(creds\.me\?\.id\) \{\s*\/\/ start buffering important events\s*\/\/ if we're logged in\s*ev\.buffer\(\);\s*didStartBuffer = true;\s*\}/;
    if (bufferBlock.test(code)) {
        code = code.replace(bufferBlock, '// [PATCHED] event buffer disabled\n            didStartBuffer = false;');
        patched = true;
    }

    const offlineFlush = /if \(didStartBuffer\) \{\s*ev\.flush\(\);\s*logger\.trace\('flushed events for initial buffer'\);\s*\}/;
    if (offlineFlush.test(code)) {
        code = code.replace(offlineFlush, '// [PATCHED] no buffer to flush');
        patched = true;
    }

    code = code.replace(
        /if \(!offlineHandled && didStartBuffer\) \{/,
        'if (!offlineHandled) {'
    );

    code = code.replace(
        "logger.warn('CB:ib,,offline never fired, force-flushing buffer and signaling readiness');",
        "logger.warn('CB:ib,,offline never fired, signaling readiness');"
    );

    const forceFlushLine = /offlineHandled = true;\s*ev\.flush\(\);\s*ev\.emit\('connection\.update'/;
    if (forceFlushLine.test(code)) {
        code = code.replace(forceFlushLine, "offlineHandled = true;\n            ev.emit('connection.update'");
        patched = true;
    }

    if (patched) {
        fs.writeFileSync(SOCKET_FILE, code, 'utf-8');
        console.log('[patch-baileys] socket.js patched - event buffering disabled');
    } else {
        console.log('[patch-baileys] socket.js - no matching patterns found');
    }
}

function patchChats() {
    if (!fs.existsSync(CHATS_FILE)) { console.log('[patch-baileys] chats.js not found, skipping'); return; }
    let code = fs.readFileSync(CHATS_FILE, 'utf-8');

    if (code.includes('Skipping AwaitingInitialSync')) {
        console.log('[patch-baileys] chats.js already patched');
        return;
    }

    const syncBlock = /syncState = SyncState\.AwaitingInitialSync;\s*logger\.info\('Connection is now AwaitingInitialSync, buffering events'\);\s*ev\.buffer\(\);[\s\S]*?(?=\s*\}\);)/;

    if (syncBlock.test(code)) {
        code = code.replace(syncBlock,
            "syncState = SyncState.Online;\n        logger.info('Skipping AwaitingInitialSync \\u2014 transitioning directly to Online (no buffering).');\n        try { ev.flush(); } catch(_) {}"
        );
        fs.writeFileSync(CHATS_FILE, code, 'utf-8');
        console.log('[patch-baileys] chats.js patched - AwaitingInitialSync bypassed');
    } else {
        console.log('[patch-baileys] chats.js - no matching patterns found (may already be patched differently)');
    }
}

function patchMessagesRecv() {
    if (!fs.existsSync(MESSAGES_RECV_FILE)) { console.log('[patch-baileys] messages-recv.js not found, skipping'); return; }
    let recvContent = fs.readFileSync(MESSAGES_RECV_FILE, 'utf-8');

    if (!recvContent.includes('// silenced mex newsletter')) {
        recvContent = recvContent.replace(
            "logger.warn({ node }, 'Invalid mex newsletter notification');",
            '// silenced mex newsletter\n            return;'
        );
        recvContent = recvContent.replace(
            "logger.warn({ data }, 'Invalid mex newsletter notification content');",
            '// silenced mex newsletter content\n            return;'
        );
        fs.writeFileSync(MESSAGES_RECV_FILE, recvContent, 'utf-8');
        console.log('[patch-baileys] Silenced mex newsletter notification warnings');
    } else {
        console.log('[patch-baileys] Newsletter warnings already silenced');
    }
}

function patchSessionCipher() {
    const SESSION_CIPHER_FILE = path.join(__dirname, '..', 'node_modules', '@whiskeysockets', 'baileys', 'node_modules', 'libsignal', 'src', 'session_cipher.js');
    if (!fs.existsSync(SESSION_CIPHER_FILE)) { console.log('[patch-baileys] session_cipher.js not found, skipping'); return; }
    let cipherContent = fs.readFileSync(SESSION_CIPHER_FILE, 'utf-8');

    if (!cipherContent.includes('// silenced decrypt errors')) {
        cipherContent = cipherContent.replace(
            'console.error("Failed to decrypt message with any known session...");',
            '// silenced decrypt errors'
        );
        cipherContent = cipherContent.replace(
            'console.error("Session error:" + e, e.stack);',
            '// silenced session error log'
        );
        fs.writeFileSync(SESSION_CIPHER_FILE, cipherContent, 'utf-8');
        console.log('[patch-baileys] Silenced libsignal decrypt error console logs');
    } else {
        console.log('[patch-baileys] libsignal decrypt errors already silenced');
    }
}

function patchSendDiagnostics() {
    if (!fs.existsSync(SOCKET_FILE)) return;
    let code = fs.readFileSync(SOCKET_FILE, 'utf-8');

    if (code.includes('// [PATCHED] send diagnostics')) {
        console.log('[patch-baileys] send diagnostics already patched');
        return;
    }

    // Patch sendRawMessage to log ws.isOpen state and any send errors
    const original = `    const sendRawMessage = async (data) => {
        if (!ws.isOpen) {
            throw new boom_1.Boom('Connection Closed', { statusCode: Types_1.DisconnectReason.connectionClosed });
        }
        const bytes = noise.encodeFrame(data);
        await (0, Utils_1.promiseTimeout)(connectTimeoutMs, async (resolve, reject) => {
            try {
                await sendPromise.call(ws, bytes);
                resolve();
            }
            catch (error) {
                reject(error);
            }
        });
    };`;

    const patched = `    // [PATCHED] send diagnostics
    const sendRawMessage = async (data) => {
        if (!ws.isOpen) {
            console.error('[TRUTH-MD] sendRawMessage BLOCKED: ws.isOpen=false (connection closed), bytes:', data && data.length);
            throw new boom_1.Boom('Connection Closed', { statusCode: Types_1.DisconnectReason.connectionClosed });
        }
        const bytes = noise.encodeFrame(data);
        await (0, Utils_1.promiseTimeout)(connectTimeoutMs, async (resolve, reject) => {
            try {
                await sendPromise.call(ws, bytes);
                resolve();
            }
            catch (error) {
                console.error('[TRUTH-MD] sendRawMessage FAILED:', error && error.message);
                reject(error);
            }
        });
    };`;

    if (code.includes(original)) {
        code = code.replace(original, patched);
        fs.writeFileSync(SOCKET_FILE, code, 'utf-8');
        console.log('[patch-baileys] send diagnostics patched into socket.js');
    } else {
        console.log('[patch-baileys] send diagnostics: pattern not matched in socket.js');
    }
}

const MESSAGES_SEND_FILE = path.join(__dirname, '..', 'node_modules', '@whiskeysockets', 'baileys', 'lib', 'Socket', 'messages-send.js');

function patchRelaySendDiagnostics() {
    if (!fs.existsSync(MESSAGES_SEND_FILE)) { console.log('[patch-baileys] messages-send.js not found'); return; }
    let code = fs.readFileSync(MESSAGES_SEND_FILE, 'utf-8');

    if (code.includes('// [PATCHED] relay diagnostics')) {
        console.log('[patch-baileys] relay diagnostics already patched');
        return;
    }

    // Wrap sendMessage to log call + errors
    const original = `        sendMessage: async (jid, content, options = {}) => {`;
    const patched = `        // [PATCHED] relay diagnostics
        sendMessage: async (jid, content, options = {}) => {
            console.log('[TRUTH-MD] sendMessage called → jid:', jid, 'type:', content && Object.keys(content)[0]);`;

    if (code.includes(original)) {
        code = code.replace(original, patched);
        fs.writeFileSync(MESSAGES_SEND_FILE, code, 'utf-8');
        console.log('[patch-baileys] relay diagnostics patched into messages-send.js');
    } else {
        console.log('[patch-baileys] relay diagnostics: sendMessage pattern not matched');
    }
}

console.log('[patch-baileys] Applying Baileys patches...');
patchSocket();
patchChats();
patchMessagesRecv();
patchSessionCipher();
patchSendDiagnostics();
patchRelaySendDiagnostics();
console.log('[patch-baileys] Done.');
