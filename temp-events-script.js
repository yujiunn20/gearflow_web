
    const SUPABASE_URL = 'https://ijsuhfeznfnpqpxkwmni.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlqc3VoZmV6bmZucHFweGt3bW5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxODc2NTgsImV4cCI6MjA5Nzc2MzY1OH0.Ca-TuNTvBD8RaPYP_mULtDuLpLuJS-ew4QMIL4A4JA4';
    const WORKSPACE_CACHE_KEY = 'gearflow-web-selected-workspace';
    const WORKSPACE_EVENT_CACHE_PREFIX = 'gearflow-web-selected-event:';
    const { createClient } = supabase;
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const authShell = document.getElementById('auth-shell');
    const workspaceShell = document.getElementById('workspace-shell');
    const eventsShell = document.getElementById('events-shell');
    const authForm = document.getElementById('auth-form');
    const authEmail = document.getElementById('auth-email');
    const authPassword = document.getElementById('auth-password');
    const authSubmit = document.getElementById('auth-submit');
    const authToggle = document.getElementById('auth-toggle');
    const authStatus = document.getElementById('auth-status');
    const systemStatus = document.getElementById('system-status');
    const systemStatusText = document.getElementById('system-status-text');
    const signOutBtn = document.getElementById('sign-out-btn');
    const workspaceList = document.getElementById('workspace-list');
    const workspaceTitle = document.getElementById('workspace-title');
    const workspaceSummary = document.getElementById('workspace-summary');
    const workspaceBadges = document.getElementById('workspace-badges');
    const eventList = document.getElementById('event-list');
    const eventDetail = document.getElementById('event-detail');
    const eventSearch = document.getElementById('event-search');
    const eventFilters = document.getElementById('event-filters');
    const metricEventCount = document.getElementById('metric-event-count');
    const metricActiveCount = document.getElementById('metric-active-count');
    const metricSiteCount = document.getElementById('metric-site-count');
    const metricItemCount = document.getElementById('metric-item-count');

    const state = {
      session: null,
      authMode: 'signIn',
      workspaces: [],
      selectedWorkspaceId: '',
      events: [],
      selectedEventId: '',
      loading: false,
      filter: 'all',
      query: '',
      scrollRequested: false,
      isSigningOut: false,
    };

    function escapeHtml(value) {
      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }

    function setSystemMessage(message, isError = false) {
      if (systemStatusText) {
        systemStatusText.textContent = message;
      }
      if (systemStatus) {
        systemStatus.classList.toggle('error', isError);
      }
    }

    function setAuthMessage(message, isError = false) {
      authStatus.textContent = message;
      authStatus.style.color = isError ? 'var(--accent-ink)' : 'var(--muted)';
      setSystemMessage(message, isError);
    }

    function setVisible(node, visible) {
      node.classList.toggle('app-hidden', !visible);
    }

    function withTimeout(promise, label, ms = 12000) {
      let timerId;
      const timeout = new Promise((_, reject) => {
        timerId = window.setTimeout(() => reject(new Error(`${label} 逾時，請重新整理或稍後再試。`)), ms);
      });
      return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timerId));
    }

    function resetViewerState() {
      state.workspaces = [];
      state.selectedWorkspaceId = '';
      state.events = [];
      state.selectedEventId = '';
      workspaceList.innerHTML = '';
      workspaceTitle.textContent = '事件頁';
      workspaceSummary.textContent = '尚未選擇工作區。';
      workspaceBadges.innerHTML = '';
      eventList.innerHTML = '';
      eventDetail.innerHTML = '';
      renderMetrics([]);
    }

    function scrollToDetailIfNeeded() {
      if (window.matchMedia('(max-width: 920px)').matches) {
        window.requestAnimationFrame(() => {
          eventDetail?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    }

    window.addEventListener('error', (event) => {
      const message = event?.message || '未知腳本錯誤';
      setSystemMessage(`頁面錯誤：${message}`, true);
    });

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event?.reason instanceof Error ? event.reason.message : String(event?.reason || '未知 Promise 錯誤');
      setSystemMessage(`載入失敗：${reason}`, true);
    });

    function currentWorkspace() {
      return state.workspaces.find((workspace) => workspace.id === state.selectedWorkspaceId) || null;
    }

    function currentEvent() {
      return state.events.find((event) => event.id === state.selectedEventId) || null;
    }

    function loadSelectedWorkspaceId() {
      try {
        return localStorage.getItem(WORKSPACE_CACHE_KEY) || '';
      } catch {
        return '';
      }
    }

    function persistSelectedWorkspaceId(workspaceId) {
      try {
        localStorage.setItem(WORKSPACE_CACHE_KEY, workspaceId);
      } catch {
        // ignore
      }
    }

    function loadSelectedEventId(workspaceId) {
      try {
        return localStorage.getItem(WORKSPACE_EVENT_CACHE_PREFIX + workspaceId) || '';
      } catch {
        return '';
      }
    }

    function persistSelectedEventId(workspaceId, eventId) {
      try {
        localStorage.setItem(WORKSPACE_EVENT_CACHE_PREFIX + workspaceId, eventId);
      } catch {
        // ignore
      }
    }

    async function restoreSession() {
      try {
        setSystemMessage('正在確認登入狀態...');
        const { data, error } = await withTimeout(client.auth.getSession(), '取得登入狀態');
        if (error) {
          setAuthMessage(error.message, true);
          renderAuthState();
          return;
        }
        state.session = data.session;
        if (state.session) {
          await afterSignIn();
        } else {
          renderAuthState();
        }
      } catch (error) {
        setAuthMessage(error.message || '無法取得登入狀態', true);
        renderAuthState();
      }
    }

    async function signIn() {
      const email = authEmail.value.trim();
      const password = authPassword.value;
      if (!email || !password) {
        setAuthMessage('請輸入 Email 與密碼。', true);
        return;
      }

      authSubmit.disabled = true;
      authToggle.disabled = true;
      setAuthMessage(state.authMode === 'signIn' ? '登入中...' : '建立帳號中...');

      try {
        const result = state.authMode === 'signIn'
          ? await client.auth.signInWithPassword({ email, password })
          : await client.auth.signUp({ email, password });

        if (result.error) {
          throw result.error;
        }

        if (!result.data.session) {
          setAuthMessage('帳號已建立，請先完成 Email 驗證後再登入。', false);
          return;
        }

        state.session = result.data.session;
        await afterSignIn();
      } catch (error) {
        setAuthMessage(error.message || '登入失敗', true);
      } finally {
        authSubmit.disabled = false;
        authToggle.disabled = false;
      }
    }

    async function signOut(event) {
      event?.preventDefault();
      if (state.isSigningOut) return;
      state.isSigningOut = true;
      signOutBtn.disabled = true;
      setSystemMessage('正在登出...');
      state.session = null;
      resetViewerState();
      renderAuthState();

      try {
        await withTimeout(client.auth.signOut({ scope: 'local' }), '登出', 5000);
      } catch (error) {
        console.warn('Supabase signOut failed after local logout:', error);
      } finally {
        state.isSigningOut = false;
        signOutBtn.disabled = false;
        window.location.href = 'index.html';
      }
    }

    async function afterSignIn() {
      setAuthMessage(`已登入 ${state.session.user.email}`);
      setVisible(authShell, false);
      setVisible(workspaceShell, true);
      setVisible(eventsShell, true);
      signOutBtn.classList.remove('login-hidden');
      await loadWorkspaces();
    }

    function renderAuthState() {
      resetViewerState();
      setVisible(authShell, true);
      setVisible(workspaceShell, false);
      setVisible(eventsShell, false);
      signOutBtn.classList.add('login-hidden');
      setAuthMessage('請先登入 Supabase 帳號。');
    }

    async function loadWorkspaces() {
      if (!state.session) return;

      setSystemMessage('正在載入你的雲端空間...');
      workspaceList.innerHTML = '<div class="event-empty">正在載入工作區...</div>';

      try {
        const user = state.session.user;
        const memberResult = await withTimeout(
          client.from('workspace_members').select('workspace_id, role').eq('user_id', user.id),
          '載入工作區權限'
        );

        if (memberResult.error) {
          throw memberResult.error;
        }

        const membershipRows = memberResult.data || [];
        const workspaceIds = membershipRows.map((row) => row.workspace_id).filter(Boolean);
        const roleMap = new Map(membershipRows.map((row) => [row.workspace_id, row.role || 'viewer']));
        let workspaces = [];

        if (workspaceIds.length) {
          const workspaceResult = await withTimeout(
            client.from('workspaces').select('id, name, owner_email').in('id', workspaceIds).order('name', { ascending: true }),
            '載入雲端空間'
          );
          if (workspaceResult.error) throw workspaceResult.error;
          workspaces = workspaceResult.data || [];
        }

        if (!workspaces.length && user.email) {
          const ownedResult = await withTimeout(
            client.from('workspaces').select('id, name, owner_email').eq('owner_email', user.email).order('name', { ascending: true }),
            '載入擁有的雲端空間'
          );
          if (!ownedResult.error && ownedResult.data?.length) {
            workspaces = ownedResult.data;
            ownedResult.data.forEach((workspace) => roleMap.set(workspace.id, 'owner'));
          }
        }

        state.workspaces = workspaces.map((workspace) => ({
          id: workspace.id,
          name: workspace.name || '未命名工作區',
          ownerEmail: workspace.owner_email || '',
          role: roleMap.get(workspace.id) || 'viewer',
        }));

        if (!state.workspaces.length) {
          state.selectedWorkspaceId = '';
          workspaceList.innerHTML = '<div class="event-empty">這個帳號目前沒有可查看的雲端空間。請確認 App 是否已同步雲端空間，或 Supabase 的 workspace_members 是否有這個登入帳號。</div>';
          workspaceTitle.textContent = '事件頁';
          workspaceSummary.textContent = `已登入 ${escapeHtml(user.email || '目前帳號')}，但沒有找到可查看的工作區。`;
          workspaceBadges.innerHTML = '';
          renderEvents([]);
          renderMetrics([]);
          setSystemMessage('沒有找到可查看的雲端空間。', true);
          return;
        }

        const savedWorkspaceId = loadSelectedWorkspaceId();
        const savedExists = state.workspaces.some((workspace) => workspace.id === savedWorkspaceId);
        state.selectedWorkspaceId = savedExists ? savedWorkspaceId : state.workspaces[0].id;
        persistSelectedWorkspaceId(state.selectedWorkspaceId);
        renderWorkspaceList();
        await loadEventsForWorkspace(state.selectedWorkspaceId);
      } catch (error) {
        workspaceList.innerHTML = `<div class="event-empty">載入工作區失敗：${escapeHtml(error.message || error)}</div>`;
        eventList.innerHTML = '<div class="event-empty">工作區載入失敗，無法載入事件。</div>';
        eventDetail.innerHTML = '<div class="event-empty">請重新整理頁面，或先登出後再登入。</div>';
        renderMetrics([]);
        setAuthMessage(`載入工作區失敗：${error.message || error}`, true);
      }
    }

    function renderWorkspaceList() {
      if (!workspaceList) return;

      if (!state.workspaces.length) {
        workspaceList.innerHTML = '<div class="event-empty">沒有可用的雲端空間。</div>';
        return;
      }

      workspaceList.innerHTML = state.workspaces.map((workspace) => `
        <button class="workspace-card${workspace.id === state.selectedWorkspaceId ? ' active' : ''}" type="button" data-workspace-id="${escapeHtml(workspace.id)}">
          <strong>${escapeHtml(workspace.name)}</strong>
          <span>${escapeHtml(workspace.ownerEmail || '無 owner') || '無 owner'}</span>
          <div class="workspace-badges">
            <span class="pill active">${escapeHtml(workspace.role)}</span>
            <span class="pill">${escapeHtml(workspace.id)}</span>
          </div>
        </button>
      `).join('');

      workspaceList.querySelectorAll('[data-workspace-id]').forEach((button) => {
        button.addEventListener('click', async () => {
          const workspaceId = button.getAttribute('data-workspace-id') || '';
          if (workspaceId === state.selectedWorkspaceId) return;
          const previousWorkspaceId = state.selectedWorkspaceId;
          const previousEventId = state.selectedEventId;
          if (previousWorkspaceId && previousEventId) {
            persistSelectedEventId(previousWorkspaceId, previousEventId);
          }
          state.selectedWorkspaceId = workspaceId;
          persistSelectedWorkspaceId(workspaceId);
          renderWorkspaceList();
          await loadEventsForWorkspace(workspaceId);
        });
      });
    }

    async function loadEventsForWorkspace(workspaceId) {
      const workspace = state.workspaces.find((item) => item.id === workspaceId);
      if (!workspace) return;

      setSystemMessage(`正在載入事件：${workspace.name}`);
      workspaceTitle.textContent = workspace.name;
      workspaceSummary.textContent = `owner: ${workspace.ownerEmail || 'N/A'} · role: ${workspace.role}`;
      workspaceBadges.innerHTML = `
        <span class="pill active">Cloud workspace</span>
        <span class="pill">${escapeHtml(workspace.role)}</span>
        <span class="pill">只讀查看</span>
      `;

      eventList.innerHTML = '<div class="event-empty">正在載入事件...</div>';
      eventDetail.innerHTML = '<div class="event-empty">正在載入內容...</div>';

      const { data, error } = await withTimeout(
        client
          .from('events')
          .select('*, event_transports(*), event_sites(*), event_items(*), event_people(*)')
          .eq('workspace_id', workspaceId)
          .order('name', { ascending: true }),
        '載入事件'
      );

      if (error) {
        eventList.innerHTML = `<div class="event-empty">載入事件失敗：${escapeHtml(error.message)}</div>`;
        eventDetail.innerHTML = `<div class="event-empty">${escapeHtml(error.message)}</div>`;
        setAuthMessage(`載入事件失敗：${error.message}`, true);
        renderMetrics([]);
        return;
      }

      state.events = (data || []).map(normalizeEvent);
      const savedEventId = loadSelectedEventId(workspaceId);
      state.selectedEventId = state.events.find((event) => event.id === savedEventId)?.id || state.events[0]?.id || '';
      persistSelectedEventId(workspaceId, state.selectedEventId);
      renderWorkspaceList();
      renderEvents();
      renderMetrics(state.events);
      setSystemMessage(`已載入 ${state.events.length} 個事件。`);
      scrollToDetailIfNeeded();
    }

    function normalizeEvent(row) {
      return {
        id: row.id,
        name: row.name || '未命名事件',
        dateLabel: row.date_label || '',
        status: row.status || 'draft',
        description: row.description || '',
        createdAtLabel: row.created_at_label || '',
        updatedAtLabel: row.updated_at_label || '',
        transports: (row.event_transports || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
        sites: (row.event_sites || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
        items: row.event_items || [],
        people: row.event_people || [],
      };
    }

    function statusLabel(status) {
      switch (status) {
        case 'active': return '進行中';
        case 'completed': return '已完成';
        case 'archived': return '已封存';
        default: return '草稿';
      }
    }

    function filteredEvents(events = state.events) {
      const query = state.query.trim().toLowerCase();
      return events.filter((event) => state.filter === 'all' || event.status === state.filter).filter((event) => {
        if (!query) return true;
        const haystack = [
          event.name,
          event.description,
          event.dateLabel,
          event.id,
          ...(event.transports || []).map((item) => item.name || item.representative || ''),
          ...(event.sites || []).map((item) => item.name || ''),
          ...(event.items || []).map((item) => item.name || ''),
        ].join(' ').toLowerCase();
        return haystack.includes(query);
      });
    }

    function renderEvents(events = state.events) {
      events = filteredEvents(events);
      if (!events.length) {
        eventList.innerHTML = '<div class="event-empty">這個雲端空間目前還沒有事件。</div>';
        eventDetail.innerHTML = '<div class="event-empty">請先建立或同步事件，這裡才會顯示內容。</div>';
        if (currentWorkspace()) { setSystemMessage(`目前工作區還沒有事件：${currentWorkspace().name}`); }
        return;
      }

      eventList.innerHTML = events.map((event) => `
        <button class="event-card${event.id === state.selectedEventId ? ' active' : ''}" type="button" data-event-id="${escapeHtml(event.id)}">
          <span class="event-card-badge">${escapeHtml(event.name.slice(0, 2).toUpperCase())}</span>
          <span class="event-card-main">
            <h3>${escapeHtml(event.name)}</h3>
            <p>${escapeHtml(event.description || '無描述')}</p>
            <div class="event-card-meta">
              <span class="pill${event.status === 'active' ? ' active' : ''}">${escapeHtml(statusLabel(event.status))}</span>
              <span class="pill">${escapeHtml(event.dateLabel || '未設定日期')}</span>
              <span class="pill">${escapeHtml(String(event.items.length))} 項目</span>
            </div>
          </span>
        </button>
      `).join('');

      eventList.querySelectorAll('[data-event-id]').forEach((button) => {
        button.addEventListener('click', () => {
          state.selectedEventId = button.getAttribute('data-event-id') || '';
          if (state.selectedWorkspaceId && state.selectedEventId) {
            persistSelectedEventId(state.selectedWorkspaceId, state.selectedEventId);
          }
          renderEvents();
          scrollToDetailIfNeeded();
        });
      });

      renderEventDetail();
    }

    function renderEventDetail() {
      const event = currentEvent();
      if (!event) {
        eventDetail.innerHTML = '<div class="event-empty">請先選擇一個事件。</div>';
        setSystemMessage('請先選擇一個事件。');
        return;
      }

      const totalItems = event.items.length;
      const totalSites = event.sites.length;
      const totalTransports = event.transports.length;
      const totalPeople = event.people.length;
      const activeLabel = statusLabel(event.status);

      eventDetail.innerHTML = `
        <div class="event-detail-hero">
          <div class="event-detail-kicker">
            <div>
              <div class="detail-badges">
                <span class="pill${event.status === 'active' ? ' active' : ''}">${escapeHtml(activeLabel)}</span>
                <span class="pill">${escapeHtml(event.dateLabel || '未設定日期')}</span>
                <span class="pill">${escapeHtml(event.id)}</span>
              </div>
              <h2>${escapeHtml(event.name)}</h2>
            </div>
            <span class="pill active">唯讀檢視</span>
          </div>
          <p class="event-detail-summary">${escapeHtml(event.description || '這個事件還沒有描述。')}</p>
          <p class="event-detail-note">資訊來源：Supabase · ${escapeHtml(currentWorkspace()?.name || '未選擇工作區')}</p>
          <div class="event-detail-grid">
            <div class="event-detail-stat"><strong>${escapeHtml(String(totalTransports))}</strong><span>運輸資訊</span></div>
            <div class="event-detail-stat"><strong>${escapeHtml(String(totalSites))}</strong><span>站點</span></div>
            <div class="event-detail-stat"><strong>${escapeHtml(String(totalItems))}</strong><span>裝備項目</span></div>
          </div>
        </div>

        <section class="event-detail-section">
          <h3>事件資訊</h3>
          <p class="event-detail-summary" style="margin:0;">建立活動後，這裡會顯示說明、時程與工作重點。</p>
          <div class="detail-badges" style="margin-top:12px;">
            <span class="pill">Created: ${escapeHtml(event.createdAtLabel || '未設定')}</span>
            <span class="pill">Updated: ${escapeHtml(event.updatedAtLabel || '未設定')}</span>
          </div>
        </section>

        <section class="event-detail-section">
          <h3>運輸資訊</h3>
          ${totalTransports ? `<ul class="event-detail-list">${event.transports.map((transport) => `<li>${escapeHtml(transport.name || transport.representative || '未命名運輸')}</li>`).join('')}</ul>` : '<div class="event-empty">目前沒有運輸資料。</div>'}
        </section>

        <section class="event-detail-section">
          <h3>站點與裝備</h3>
          ${totalSites ? `<ul class="event-detail-list">${event.sites.map((site) => `<li>${escapeHtml(site.name || '未命名站點')}</li>`).join('')}</ul>` : '<div class="event-empty">目前沒有站點資料。</div>'}
          ${totalItems ? `<ul class="event-detail-list" style="margin-top:12px;">${event.items.map((item) => `<li>${escapeHtml(item.name || '未命名裝備')}</li>`).join('')}</ul>` : '<div class="event-empty" style="margin-top:12px;">目前沒有裝備項目。</div>'}
        </section>

        <section class="event-detail-section">
          <h3>人員</h3>
          ${totalPeople ? `<ul class="event-detail-list">${event.people.map((person) => `<li>${escapeHtml(person.name || '未命名人員')}</li>`).join('')}</ul>` : '<div class="event-empty">目前沒有花名冊資料。</div>'}
        </section>
      `;
    }

    function renderMetrics(events) {
      metricEventCount.textContent = String(events.length);
      metricActiveCount.textContent = String(events.filter((event) => event.status === 'active').length);
      metricSiteCount.textContent = String(events.reduce((sum, event) => sum + event.sites.length, 0));
      metricItemCount.textContent = String(events.reduce((sum, event) => sum + event.items.length, 0));
    }

    eventSearch.addEventListener('input', () => {
      state.query = eventSearch.value;
      renderEvents();
    });

    eventFilters.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-filter]');
      if (!chip) return;
      state.filter = chip.getAttribute('data-filter') || 'all';
      eventFilters.querySelectorAll('[data-filter]').forEach((button) => {
        button.classList.toggle('active', button === chip);
      });
      renderEvents();
    });

    authForm.addEventListener('submit', (event) => {
      event.preventDefault();
      signIn();
    });

    authToggle.addEventListener('click', () => {
      state.authMode = state.authMode === 'signIn' ? 'create' : 'signIn';
      authSubmit.textContent = state.authMode === 'signIn' ? '登入' : '建立帳號';
      authToggle.textContent = state.authMode === 'signIn' ? '建立帳號' : '使用既有帳號';
    });

    signOutBtn.addEventListener('click', signOut);

    client.auth.onAuthStateChange((event, session) => {
      if (state.isSigningOut) return;
      if (event === 'SIGNED_OUT') {
        state.session = null;
        renderAuthState();
        return;
      }
      if (event === 'TOKEN_REFRESHED') {
        state.session = session;
      }
    });

    restoreSession();
  