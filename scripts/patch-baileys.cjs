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

      // Baileys 7.x pattern
      const bufferBlock7 = /if \(creds\.me\?\..id\) \{\s*\/\/ start buffering important events\s*\/\/ if we're logged in\s*ev\.buffer\(\);\s*didStartBuffer = true;\s*\}/;
      if (bufferBlock7.test(code)) {
          code = code.replace(bufferBlock7,
              '// [PATCHED] event buffer disabled\n            didStartBuffer = false;'
          );
          patched = true;
      }

      // Baileys 6.x pattern (fallback)
      const bufferBlock6 = /if \(creds\.me\?\..id\) \{\s*\/\/ start buffering important events\s*\/\/ if we're logged in\s*ev\.buffer\(\);\s*didStartBuffer = true;\s*\}/;
      if (!patched && bufferBlock6.test(code)) {
          code = code.replace(bufferBlock6,
              '// [PATCHED] event buffer disabled\n            didStartBuffer = false;'
          );
          patched = true;
      }

      // Flush block — same pattern in 6.x and 7.x
      const offlineFlush = /if \(didStartBuffer\) \{\s*ev\.flush\(\);\s*logger\.trace\('flushed events for initial buffer'\);\s*\}/;
      if (offlineFlush.test(code)) {
          code = code.replace(offlineFlush, '// [PATCHED] no buffer to flush');
          patched = true;
      }

      code = code.replace(
          /if \(!offlineHandled && didStartBuffer\) \{/,
          'if (!offlineHandled) {'
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
          console.log('[patch-baileys] socket.js - no matching patterns found (may not need patching in this version)');
      }
  }

  function patchChats() {
      if (!fs.existsSync(CHATS_FILE)) { console.log('[patch-baileys] chats.js not found, skipping'); return; }
      let code = fs.readFileSync(CHATS_FILE, 'utf-8');

      if (code.includes('Skipping AwaitingInitialSync') || code.includes('// [PATCHED] skip sync')) {
          console.log('[patch-baileys] chats.js already patched');
          return;
      }

      // Baileys 7.x: exact text match
      const target7 = `syncState = SyncState.AwaitingInitialSync;
          logger.info('Connection is now AwaitingInitialSync, buffering events');
          ev.buffer();`;

      if (code.includes(target7)) {
          code = code.replace(target7,
              `// [PATCHED] skip sync - go directly to Online
          syncState = SyncState.Online;
          logger.info('Skipping AwaitingInitialSync — transitioning directly to Online (no buffering).');
          try { ev.flush(); } catch(_) {}`
          );
          fs.writeFileSync(CHATS_FILE, code, 'utf-8');
          console.log('[patch-baileys] chats.js patched (7.x) - AwaitingInitialSync bypassed');
          return;
      }

      // Baileys 6.x pattern (fallback regex)
      const syncBlock6 = /syncState = SyncState\.AwaitingInitialSync;\s*logger\.info\('Connection is now AwaitingInitialSync, buffering events'\);\s*ev\.buffer\(\);/;
      if (syncBlock6.test(code)) {
          code = code.replace(syncBlock6,
              `syncState = SyncState.Online;
          logger.info('Skipping AwaitingInitialSync — transitioning directly to Online (no buffering).');
          try { ev.flush(); } catch(_) {}`
          );
          fs.writeFileSync(CHATS_FILE, code, 'utf-8');
          console.log('[patch-baileys] chats.js patched (6.x fallback) - AwaitingInitialSync bypassed');
          return;
      }

      console.log('[patch-baileys] chats.js - no matching patterns found');
  }

  function patchMessagesRecv() {
      if (!fs.existsSync(MESSAGES_RECV_FILE)) { console.log('[patch-baileys] messages-recv.js not found, skipping'); return; }
      let code = fs.readFileSync(MESSAGES_RECV_FILE, 'utf-8');

      if (code.includes('// silenced mex newsletter')) {
          console.log('[patch-baileys] messages-recv.js already patched');
          return;
      }

      let patched = false;
      if (code.includes("logger.warn({ node }, 'Invalid mex newsletter notification');")) {
          code = code.replace(
              "logger.warn({ node }, 'Invalid mex newsletter notification');",
              '// silenced mex newsletter\n            return;'
          );
          patched = true;
      }
      if (code.includes("logger.warn({ data }, 'Invalid mex newsletter notification content');")) {
          code = code.replace(
              "logger.warn({ data }, 'Invalid mex newsletter notification content');",
              '// silenced mex newsletter content\n            return;'
          );
          patched = true;
      }

      if (patched) {
          fs.writeFileSync(MESSAGES_RECV_FILE, code, 'utf-8');
          console.log('[patch-baileys] Silenced mex newsletter notification warnings');
      } else {
          console.log('[patch-baileys] messages-recv.js - newsletter patterns not found (may not exist in this version)');
      }
  }

  function patchSessionCipher() {
      // Try nested libsignal (6.x) then top-level (7.x)
      const candidates = [
          path.join(__dirname, '..', 'node_modules', '@whiskeysockets', 'baileys', 'node_modules', 'libsignal', 'src', 'session_cipher.js'),
          path.join(__dirname, '..', 'node_modules', 'libsignal', 'src', 'session_cipher.js'),
      ];
      const SESSION_CIPHER_FILE = candidates.find(f => fs.existsSync(f));
      if (!SESSION_CIPHER_FILE) { console.log('[patch-baileys] session_cipher.js not found, skipping'); return; }

      let code = fs.readFileSync(SESSION_CIPHER_FILE, 'utf-8');
      if (code.includes('// silenced decrypt errors')) {
          console.log('[patch-baileys] session_cipher.js already patched');
          return;
      }

      code = code.replace(
          'console.error("Failed to decrypt message with any known session...");',
          '// silenced decrypt errors'
      );
      code = code.replace(
          'console.error("Session error:" + e, e.stack);',
          '// silenced session error log'
      );
      fs.writeFileSync(SESSION_CIPHER_FILE, code, 'utf-8');
      console.log('[patch-baileys] Silenced libsignal decrypt error logs');
  }

  console.log('[patch-baileys] Applying Baileys patches...');
  patchSocket();
  patchChats();
  patchMessagesRecv();
  patchSessionCipher();
  console.log('[patch-baileys] Done.');
  