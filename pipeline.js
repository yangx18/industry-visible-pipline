/* ================================================================
   工业效率流水线工具 — pipeline.js
   All logic: state, drawing engine, owner registry, rendering.
   ================================================================ */
(function() {
  'use strict';

  // ===================================================================
  // 1. Constants & Configuration
  // ===================================================================

  var NODE_W = 200;   // must match CSS --node-width
  var NODE_H = 176;   // approximate min-height
  var CANVAS_PAD = 40;
  var LOG_MAX = 100;
  var DRAG_THRESHOLD = 5;

  function _id() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
  }

  function _nameToColor(name) {
    var hash = 0;
    for (var i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    var palette = ['#2563EB','#7C3AED','#DB2777','#EA580C','#0891B2','#4F46E5','#059669','#D97706'];
    return palette[Math.abs(hash) % palette.length];
  }

  var DEFAULT_STATE = {
    schemaVersion: 2,
    projectName: 'Q1 降本增效专项',
    owner: '张伟',
    lastModified: new Date().toISOString(),

    owners: {
      '张伟': { name: '张伟', dept: '总部运营', title: '降本增效总负责人', email: 'zhangwei@company.com', avatarColor: '#2563EB' },
      '李强': { name: '李强', dept: '生产部', title: '生产线主管', email: 'liqiang@company.com', avatarColor: '#7C3AED' },
      '王芳': { name: '王芳', dept: '采购部', title: '供应链经理', email: 'wangfang@company.com', avatarColor: '#DB2777' },
      '刘丽': { name: '刘丽', dept: '品质部', title: '质量总监', email: 'liuli@company.com', avatarColor: '#EA580C' }
    },

    nodes: [
      {
        id: 'node-1', name: '总部指挥', ownerName: '张伟', weight: 2, locked: true,
        position: { x: 80, y: 80 },
        tasks: [
          { id: 'task-1a', text: '制定季度 KPI 体系', weight: 1, done: true },
          { id: 'task-1b', text: '跨部门预算审批', weight: 2, done: true },
          { id: 'task-1c', text: '明确考核标准与奖惩机制', weight: 1, done: false }
        ]
      },
      {
        id: 'node-2', name: '生产优化', ownerName: '李强', weight: 3, locked: false,
        position: { x: 380, y: 80 },
        tasks: [
          { id: 'task-2a', text: '产线布局优化方案', weight: 2, done: true },
          { id: 'task-2b', text: '设备 OEE 提升计划', weight: 3, done: false },
          { id: 'task-2c', text: '减少换模时间 (SMED)', weight: 2, done: false },
          { id: 'task-2d', text: '工艺参数标准化', weight: 1, done: true }
        ]
      },
      {
        id: 'node-3', name: '供应链降本', ownerName: '王芳', weight: 3, locked: false,
        position: { x: 680, y: 80 },
        tasks: [
          { id: 'task-3a', text: '供应商竞标与谈判', weight: 3, done: false },
          { id: 'task-3b', text: '安全库存水平优化', weight: 2, done: false },
          { id: 'task-3c', text: '物流路线整合', weight: 1, done: true }
        ]
      },
      {
        id: 'node-4', name: '交付验收', ownerName: '刘丽', weight: 2, locked: true,
        position: { x: 980, y: 80 },
        tasks: [
          { id: 'task-4a', text: '质量抽检流程落地', weight: 2, done: false },
          { id: 'task-4b', text: '客户满意度回访', weight: 1, done: false }
        ]
      }
    ],

    edges: [
      { from: 'node-1', to: 'node-2' },
      { from: 'node-2', to: 'node-3' },
      { from: 'node-3', to: 'node-4' }
    ],

    activityLog: [
      { taskId: 'task-1a', taskText: '制定季度 KPI 体系', nodeName: '总部指挥', time: '2026-03-10T09:15:00Z', done: true },
      { taskId: 'task-1b', taskText: '跨部门预算审批', nodeName: '总部指挥', time: '2026-03-12T14:30:00Z', done: true },
      { taskId: 'task-2a', taskText: '产线布局优化方案', nodeName: '生产优化', time: '2026-03-13T10:00:00Z', done: true },
      { taskId: 'task-2d', taskText: '工艺参数标准化', nodeName: '生产优化', time: '2026-03-14T11:20:00Z', done: true },
      { taskId: 'task-3c', taskText: '物流路线整合', nodeName: '供应链降本', time: '2026-03-15T08:45:00Z', done: true }
    ]
  };

  // ===================================================================
  // 2. State Management
  // ===================================================================

  var state = null;
  var selectedNodeId = null; // UI-only, not persisted

  function _deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function _commit() {
    Storage.save(state);
    document.dispatchEvent(new CustomEvent('pipeline:state-changed'));
  }

  function _findNode(id) {
    return state.nodes.find(function(n) { return n.id === id; });
  }

  function _findNodeIndex(id) {
    for (var i = 0; i < state.nodes.length; i++) {
      if (state.nodes[i].id === id) return i;
    }
    return -1;
  }

  function _findTask(nodeId, taskId) {
    var node = _findNode(nodeId);
    if (!node) return null;
    return node.tasks.find(function(t) { return t.id === taskId; });
  }

  function _rebuildEdges() {
    state.edges = [];
    for (var i = 0; i < state.nodes.length - 1; i++) {
      state.edges.push({ from: state.nodes[i].id, to: state.nodes[i + 1].id });
    }
  }

  function _addLogEntry(entry) {
    state.activityLog.push(entry);
    if (state.activityLog.length > LOG_MAX) {
      state.activityLog = state.activityLog.slice(-LOG_MAX);
    }
  }

  function _ensureOwner(ownerName) {
    if (!state.owners[ownerName]) {
      state.owners[ownerName] = {
        name: ownerName,
        dept: '',
        title: '',
        email: '',
        avatarColor: _nameToColor(ownerName)
      };
    }
  }

  var State = {
    init: function() {
      var loaded = Storage.load();
      if (loaded) {
        state = loaded;
        // Ensure owners map exists (migration from v1)
        if (!state.owners) state.owners = {};
        // Ensure edges exist
        if (!state.edges) _rebuildEdges();
        // Ensure positions exist
        state.nodes.forEach(function(n, i) {
          if (!n.position) n.position = { x: 80 + i * 300, y: 80 };
          _ensureOwner(n.ownerName);
        });
      } else {
        state = _deepClone(DEFAULT_STATE);
      }
      if (state.nodes.length > 0) {
        selectedNodeId = state.nodes[0].id;
      }
      Storage.save(state);
    },

    get: function() { return state; },
    getSelectedId: function() { return selectedNodeId; },

    selectNode: function(id) {
      selectedNodeId = id;
      document.dispatchEvent(new CustomEvent('pipeline:selection-changed'));
    },

    addNode: function(name, ownerName, weight, insertIndex) {
      _ensureOwner(ownerName);
      var prev = state.nodes[insertIndex - 1];
      var next = state.nodes[insertIndex];
      var newX, newY;
      if (prev && next) {
        newX = (prev.position.x + next.position.x) / 2;
        newY = (prev.position.y + next.position.y) / 2;
        // If too close, push subsequent nodes right
        if (next.position.x - prev.position.x < 350) {
          for (var i = insertIndex; i < state.nodes.length; i++) {
            state.nodes[i].position.x += 300;
          }
          newX = prev.position.x + 300;
          newY = prev.position.y;
        }
      } else if (prev) {
        newX = prev.position.x + 300;
        newY = prev.position.y;
      } else {
        newX = 80;
        newY = 80;
      }

      var node = {
        id: _id(),
        name: name,
        ownerName: ownerName,
        weight: Math.max(1, parseInt(weight, 10) || 1),
        locked: false,
        position: { x: newX, y: newY },
        tasks: []
      };
      state.nodes.splice(insertIndex, 0, node);
      _rebuildEdges();
      selectedNodeId = node.id;
      _commit();
      document.dispatchEvent(new CustomEvent('pipeline:selection-changed'));
      return node.id;
    },

    removeNode: function(nodeId) {
      var node = _findNode(nodeId);
      if (!node || node.locked) return false;
      state.nodes = state.nodes.filter(function(n) { return n.id !== nodeId; });
      _rebuildEdges();
      if (selectedNodeId === nodeId) {
        selectedNodeId = state.nodes.length > 0 ? state.nodes[0].id : null;
      }
      _commit();
      document.dispatchEvent(new CustomEvent('pipeline:selection-changed'));
      return true;
    },

    updateNodePosition: function(nodeId, x, y) {
      var node = _findNode(nodeId);
      if (!node) return;
      node.position.x = Math.max(0, x);
      node.position.y = Math.max(0, y);
      // Save but don't trigger full re-render (arrows are redrawn separately during drag)
      Storage.save(state);
    },

    setNodeWeight: function(nodeId, weight) {
      var node = _findNode(nodeId);
      if (!node) return;
      node.weight = Math.max(1, parseInt(weight, 10) || 1);
      _commit();
    },

    updateNodeName: function(nodeId, name) {
      var node = _findNode(nodeId);
      if (!node || !name.trim()) return;
      node.name = name.trim();
      _commit();
    },

    updateNodeOwner: function(nodeId, ownerName) {
      var node = _findNode(nodeId);
      if (!node || !ownerName.trim()) return;
      node.ownerName = ownerName.trim();
      _ensureOwner(node.ownerName);
      _commit();
    },

    updateProjectName: function(name) {
      if (!name.trim()) return false;
      state.projectName = name.trim();
      _commit();
      return true;
    },

    updateProjectOwner: function(name) {
      if (!name.trim()) return false;
      state.owner = name.trim();
      _ensureOwner(state.owner);
      _commit();
      return true;
    },

    updateOwnerField: function(ownerName, field, value) {
      if (!state.owners[ownerName]) return;
      state.owners[ownerName][field] = value.trim();
      _commit();
    },

    addTask: function(nodeId, text) {
      var node = _findNode(nodeId);
      if (!node || !text.trim()) return;
      node.tasks.push({ id: _id(), text: text.trim(), weight: 1, done: false });
      _commit();
    },

    removeTask: function(nodeId, taskId) {
      var node = _findNode(nodeId);
      if (!node) return;
      node.tasks = node.tasks.filter(function(t) { return t.id !== taskId; });
      _commit();
    },

    toggleTask: function(nodeId, taskId) {
      var task = _findTask(nodeId, taskId);
      if (!task) return;
      task.done = !task.done;
      var node = _findNode(nodeId);
      _addLogEntry({
        taskId: taskId,
        taskText: task.text,
        nodeName: node ? node.name : '',
        time: new Date().toISOString(),
        done: task.done
      });
      _commit();
    },

    setTaskWeight: function(nodeId, taskId, weight) {
      var task = _findTask(nodeId, taskId);
      if (!task) return;
      task.weight = Math.max(1, parseInt(weight, 10) || 1);
      _commit();
    },

    resetProgress: function() {
      state.nodes.forEach(function(n) {
        n.tasks.forEach(function(t) { t.done = false; });
      });
      state.activityLog = [];
      _commit();
    }
  };

  // ===================================================================
  // 3. Storage Layer
  // ===================================================================

  var Storage = {
    KEY: 'pipeline_state',

    load: function() {
      try {
        var raw = localStorage.getItem(this.KEY);
        if (!raw) return null;
        var parsed = JSON.parse(raw);
        return this.migrate(parsed);
      } catch (e) {
        console.warn('Failed to load state:', e);
        return null;
      }
    },

    save: function(s) {
      try {
        s.lastModified = new Date().toISOString();
        localStorage.setItem(this.KEY, JSON.stringify(s));
      } catch (e) {
        if (e.name === 'QuotaExceededError') {
          console.error('localStorage full');
        }
      }
    },

    migrate: function(data) {
      var migrations = {
        1: function(d) {
          // v1 → v2: add owners, edges, positions
          d.owners = d.owners || {};
          d.nodes.forEach(function(n, i) {
            if (!n.position) n.position = { x: 80 + i * 300, y: 80 };
            if (!d.owners[n.ownerName]) {
              d.owners[n.ownerName] = {
                name: n.ownerName, dept: '', title: '', email: '',
                avatarColor: _nameToColor(n.ownerName)
              };
            }
          });
          if (!d.edges) {
            d.edges = [];
            for (var i = 0; i < d.nodes.length - 1; i++) {
              d.edges.push({ from: d.nodes[i].id, to: d.nodes[i + 1].id });
            }
          }
          return d;
        }
      };
      while (migrations[data.schemaVersion]) {
        data = migrations[data.schemaVersion](data);
        data.schemaVersion++;
      }
      return data;
    }
  };

  // ===================================================================
  // 4. Drawing Engine — Drag & Arrow Calculation
  // ===================================================================

  var drag = {
    active: false,
    nodeId: null,
    startMouseX: 0,
    startMouseY: 0,
    startNodeX: 0,
    startNodeY: 0,
    moved: false,
    cardEl: null
  };

  function _getCanvasOffset() {
    var canvas = document.getElementById('pipeline-canvas');
    var rect = canvas.getBoundingClientRect();
    return { left: rect.left + window.scrollX, top: rect.top + window.scrollY };
  }

  function _onPointerDown(e) {
    var handle = e.target.closest('[data-drag="handle"]');
    if (!handle) return;
    var card = handle.closest('.node-card');
    if (!card) return;

    e.preventDefault();
    var nodeId = card.getAttribute('data-node-id');
    var node = _findNode(nodeId);
    if (!node) return;

    drag.active = true;
    drag.nodeId = nodeId;
    drag.startMouseX = e.clientX;
    drag.startMouseY = e.clientY;
    drag.startNodeX = node.position.x;
    drag.startNodeY = node.position.y;
    drag.moved = false;
    drag.cardEl = card;

    card.setPointerCapture(e.pointerId);
    card.classList.add('node-card--dragging');
  }

  function _onPointerMove(e) {
    if (!drag.active) return;

    var dx = e.clientX - drag.startMouseX;
    var dy = e.clientY - drag.startMouseY;

    if (!drag.moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) {
      return;
    }
    drag.moved = true;

    var newX = Math.max(0, drag.startNodeX + dx);
    var newY = Math.max(0, drag.startNodeY + dy);

    drag.cardEl.style.left = newX + 'px';
    drag.cardEl.style.top = newY + 'px';

    // Update node position in state (without full re-render)
    var node = _findNode(drag.nodeId);
    if (node) {
      node.position.x = newX;
      node.position.y = newY;
    }

    // Redraw arrows in real time
    Renderer.renderArrows();
    Renderer.updateCanvasSize();
  }

  function _onPointerUp(e) {
    if (!drag.active) return;

    drag.cardEl.classList.remove('node-card--dragging');

    if (drag.moved) {
      State.updateNodePosition(drag.nodeId, _findNode(drag.nodeId).position.x, _findNode(drag.nodeId).position.y);
    }

    drag.active = false;
    drag.nodeId = null;
    drag.cardEl = null;
  }

  function getArrowPath(fromNode, toNode) {
    var x1 = fromNode.position.x + NODE_W;
    var y1 = fromNode.position.y + NODE_H / 2;
    var x2 = toNode.position.x;
    var y2 = toNode.position.y + NODE_H / 2;

    var dx = x2 - x1;
    var dy = y2 - y1;
    var cpOffset = Math.max(Math.abs(dx) * 0.4, 50);

    // Cubic bezier from right edge of source to left edge of target
    return 'M ' + x1 + ' ' + y1 +
           ' C ' + (x1 + cpOffset) + ' ' + y1 +
           ', ' + (x2 - cpOffset) + ' ' + y2 +
           ', ' + x2 + ' ' + y2;
  }

  // ===================================================================
  // 5. Owner Registry
  // ===================================================================

  var OwnerRegistry = {
    _currentOwner: null,

    get: function(name) {
      return state.owners[name] || { name: name, dept: '', title: '', email: '', avatarColor: _nameToColor(name) };
    },

    openProfile: function(ownerName) {
      this._currentOwner = ownerName;
      var owner = this.get(ownerName);
      var drawer = document.getElementById('profile-drawer');
      var avatar = document.getElementById('profile-avatar');
      var nameEl = document.getElementById('profile-name');
      var subtitle = document.getElementById('profile-subtitle');
      var dept = document.getElementById('profile-dept');
      var titleField = document.getElementById('profile-title-field');
      var email = document.getElementById('profile-email');
      var nodesContainer = document.getElementById('profile-nodes');

      avatar.style.background = owner.avatarColor;
      avatar.textContent = owner.name.slice(-2);
      nameEl.textContent = owner.name;
      subtitle.textContent = [owner.dept, owner.title].filter(Boolean).join(' · ') || '—';

      // Populate editable fields
      var fields = { dept: dept, title: titleField, email: email };
      var placeholders = { dept: '点击填写部门', title: '点击填写职位', email: '点击填写联系方式' };
      Object.keys(fields).forEach(function(key) {
        var el = fields[key];
        var val = owner[key];
        el.textContent = val || placeholders[key];
        el.setAttribute('data-empty', val ? 'false' : 'true');
      });

      // Find nodes owned by this person
      nodesContainer.textContent = '';
      state.nodes.forEach(function(n) {
        if (n.ownerName === ownerName) {
          var tag = document.createElement('span');
          tag.className = 'profile-drawer__tag';
          tag.textContent = n.name;
          nodesContainer.appendChild(tag);
        }
      });

      drawer.classList.add('profile-drawer--open');

      // Close on Escape (only when not editing a field)
      var closeOnEsc = function(ev) {
        if (ev.key === 'Escape' && ev.target.tagName !== 'INPUT') {
          OwnerRegistry.closeProfile();
          document.removeEventListener('keydown', closeOnEsc);
        }
      };
      document.addEventListener('keydown', closeOnEsc);
    },

    closeProfile: function() {
      this._currentOwner = null;
      document.getElementById('profile-drawer').classList.remove('profile-drawer--open');
    },

    startFieldEdit: function(el) {
      var ownerName = this._currentOwner;
      if (!ownerName) return;
      var field = el.getAttribute('data-owner-field');
      if (!field) return;
      var owner = this.get(ownerName);
      var current = owner[field] || '';
      var placeholders = { dept: '输入部门', title: '输入职位', email: '输入联系方式' };

      var input = document.createElement('input');
      input.type = field === 'email' ? 'email' : 'text';
      input.value = current;
      input.placeholder = placeholders[field] || '';
      input.className = 'profile-drawer__edit-input';

      el.textContent = '';
      el.appendChild(input);
      input.focus();
      input.select();

      var self = this;
      var commit = function() {
        var val = input.value.trim();
        State.updateOwnerField(ownerName, field, val);
        el.textContent = val || ('点击填写' + (placeholders[field] || '').replace('输入', ''));
        el.setAttribute('data-empty', val ? 'false' : 'true');
        // Also refresh the subtitle
        var updated = self.get(ownerName);
        var subtitleEl = document.getElementById('profile-subtitle');
        subtitleEl.textContent = [updated.dept, updated.title].filter(Boolean).join(' · ') || '—';
      };

      input.addEventListener('blur', commit, { once: true });
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') {
          e.stopPropagation(); // Don't close the drawer
          input.removeEventListener('blur', commit);
          el.textContent = current || ('点击填写' + (placeholders[field] || '').replace('输入', ''));
          el.setAttribute('data-empty', current ? 'false' : 'true');
        }
      });
    }
  };

  // ===================================================================
  // 6. DOM Helpers & Rendering
  // ===================================================================

  var Progress = {
    calcNode: function(node) {
      if (!node.tasks.length) return 0;
      var total = node.tasks.reduce(function(s, t) { return s + t.weight; }, 0);
      if (total === 0) return 0;
      var done = node.tasks.filter(function(t) { return t.done; })
        .reduce(function(s, t) { return s + t.weight; }, 0);
      return done / total;
    },

    calcGlobal: function(nodes) {
      var total = nodes.reduce(function(s, n) { return s + n.weight; }, 0);
      if (total === 0) return 0;
      var self = this;
      return nodes.reduce(function(s, n) {
        return s + self.calcNode(n) * n.weight;
      }, 0) / total;
    },

    getState: function(node) {
      var p = this.calcNode(node);
      if (p >= 1) return 'complete';
      if (p > 0) return 'in-progress';
      return 'pending';
    },

    stateIcon: function(s) {
      return { pending: '\u23F8', 'in-progress': '\u25B6', complete: '\u2713' }[s] || '';
    },

    stateLabel: function(s) {
      return { pending: '待启动', 'in-progress': '进行中', complete: '已完成' }[s] || '';
    }
  };

  var tplCache = {};

  var Renderer = {
    cacheRefs: function() {
      tplCache.nodeCard = document.getElementById('tpl-node-card');
      tplCache.taskItem = document.getElementById('tpl-task-item');
      tplCache.logEntry = document.getElementById('tpl-log-entry');
    },

    renderAll: function() {
      this.renderHeader();
      this.renderPipeline();
      this.renderArrows();
      this.renderDetail();
      this.renderActivityLog();
      this.updateCanvasSize();
    },

    renderHeader: function() {
      var s = State.get();
      document.getElementById('header-title').textContent = s.projectName;
      document.getElementById('header-owner').textContent = s.owner;

      var globalPct = Math.round(Progress.calcGlobal(s.nodes) * 100);
      document.getElementById('global-progress-fill').style.width = globalPct + '%';
      document.getElementById('global-progress-text').textContent = globalPct + '%';
      var bar = document.getElementById('global-progress-bar');
      bar.setAttribute('aria-valuenow', globalPct);
    },

    renderPipeline: function() {
      var s = State.get();
      var canvas = document.getElementById('pipeline-canvas');
      var svg = document.getElementById('pipeline-arrows');

      // Remove existing node cards (keep SVG)
      var existing = canvas.querySelectorAll('.node-card');
      existing.forEach(function(el) { el.remove(); });

      var fragment = document.createDocumentFragment();

      s.nodes.forEach(function(node) {
        var tpl = tplCache.nodeCard.content.cloneNode(true);
        var card = tpl.querySelector('.node-card');
        var nodeState = Progress.getState(node);
        var pct = Math.round(Progress.calcNode(node) * 100);
        var owner = OwnerRegistry.get(node.ownerName);

        card.setAttribute('data-node-id', node.id);
        card.setAttribute('data-state', nodeState);
        card.setAttribute('aria-label', node.name + ' - ' + pct + '%');
        card.style.left = node.position.x + 'px';
        card.style.top = node.position.y + 'px';

        if (node.id === selectedNodeId) {
          card.classList.add('node-card--selected');
        }

        // Lock icon
        var lockEl = card.querySelector('.node-card__lock');
        if (!node.locked) lockEl.style.display = 'none';

        // ＋ handles — hide left on head, right on tail
        var insertBefore = card.querySelector('.node-card__insert--before');
        var insertAfter = card.querySelector('.node-card__insert--after');
        var idx = _findNodeIndex(node.id);
        if (idx === 0) insertBefore.style.display = 'none';
        if (idx === s.nodes.length - 1) insertAfter.style.display = 'none';

        // Delete button — only on unlocked nodes
        var deleteBtn = card.querySelector('.node-card__delete');
        if (node.locked) deleteBtn.style.display = 'none';

        // Status icon
        card.querySelector('.node-card__status-icon').textContent = Progress.stateIcon(nodeState);

        // Name (double-click to edit)
        card.querySelector('.node-card__name').textContent = node.name;

        // Owner avatar
        var avatarEl = card.querySelector('.node-card__avatar');
        avatarEl.style.background = owner.avatarColor;
        avatarEl.textContent = node.ownerName.slice(-2);
        card.querySelector('.node-card__owner-name').textContent = node.ownerName;

        // Owner button data
        card.querySelector('.node-card__owner-btn').setAttribute('data-owner', node.ownerName);

        // Meta
        var doneTasks = node.tasks.filter(function(t) { return t.done; }).length;
        card.querySelector('.node-card__task-count').textContent = doneTasks + '/' + node.tasks.length + ' 任务';
        card.querySelector('.node-card__weight-display').textContent = '权重 ' + node.weight;

        // Progress
        card.querySelector('.node-card__progress-fill').style.width = pct + '%';
        card.querySelector('.node-card__progress-text').textContent = pct + '%';

        // Pointer events for drag
        card.addEventListener('pointerdown', _onPointerDown);
        card.addEventListener('pointermove', _onPointerMove);
        card.addEventListener('pointerup', _onPointerUp);

        fragment.appendChild(tpl);
      });

      canvas.appendChild(fragment);
    },

    renderArrows: function() {
      var s = State.get();
      var svg = document.getElementById('pipeline-arrows');

      // Remove existing paths (keep defs)
      var paths = svg.querySelectorAll('path');
      paths.forEach(function(p) { p.remove(); });

      s.edges.forEach(function(edge) {
        var fromNode = _findNode(edge.from);
        var toNode = _findNode(edge.to);
        if (!fromNode || !toNode) return;

        var d = getArrowPath(fromNode, toNode);
        var fromState = Progress.getState(fromNode);

        var stateClass = 'active';
        if (fromState === 'complete') stateClass = 'complete';
        else if (fromState === 'pending') stateClass = 'inactive';

        // Base arrow
        var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.setAttribute('class', 'pipeline__arrow pipeline__arrow--' + stateClass);
        svg.appendChild(path);

        // Flow overlay
        var flow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        flow.setAttribute('d', d);
        flow.setAttribute('class', 'pipeline__arrow-flow pipeline__arrow-flow--' + stateClass);
        svg.appendChild(flow);
      });
    },

    updateCanvasSize: function() {
      var s = State.get();
      var canvas = document.getElementById('pipeline-canvas');
      var svg = document.getElementById('pipeline-arrows');
      var maxX = 0, maxY = 0;
      s.nodes.forEach(function(n) {
        var right = n.position.x + NODE_W + CANVAS_PAD * 2;
        var bottom = n.position.y + NODE_H + CANVAS_PAD * 2;
        if (right > maxX) maxX = right;
        if (bottom > maxY) maxY = bottom;
      });
      maxX = Math.max(maxX, canvas.parentElement.clientWidth);
      maxY = Math.max(maxY, 320);
      canvas.style.width = maxX + 'px';
      canvas.style.height = maxY + 'px';
      svg.setAttribute('width', maxX);
      svg.setAttribute('height', maxY);
    },

    renderDetail: function() {
      var s = State.get();
      var container = document.getElementById('detail-container');

      if (!selectedNodeId) {
        container.textContent = '';
        var empty = document.createElement('div');
        empty.className = 'detail__empty';
        var icon = document.createElement('div');
        icon.className = 'detail__empty-icon';
        icon.textContent = '\uD83D\uDD0D';
        var msg = document.createElement('p');
        msg.textContent = '点击上方节点查看子任务详情';
        empty.appendChild(icon);
        empty.appendChild(msg);
        container.appendChild(empty);
        return;
      }

      var node = _findNode(selectedNodeId);
      if (!node) return;

      var nodeState = Progress.getState(node);
      var pct = Math.round(Progress.calcNode(node) * 100);

      var panel = document.createElement('div');
      panel.className = 'detail__panel';

      // Header
      var header = document.createElement('div');
      header.className = 'detail__header';

      var info = document.createElement('div');
      info.className = 'detail__header-info';

      var nameEl = document.createElement('h2');
      nameEl.className = 'detail__node-name';
      nameEl.textContent = node.name;

      var badge = document.createElement('span');
      badge.className = 'detail__node-badge detail__node-badge--' + nodeState;
      badge.textContent = Progress.stateIcon(nodeState) + ' ' + Progress.stateLabel(nodeState) + ' ' + pct + '%';

      var ownerEl = document.createElement('span');
      ownerEl.className = 'detail__node-owner';
      ownerEl.textContent = '负责人：' + node.ownerName;

      info.appendChild(nameEl);
      info.appendChild(badge);
      info.appendChild(ownerEl);

      var headerRight = document.createElement('div');
      headerRight.className = 'detail__header-right';

      var weightGroup = document.createElement('div');
      weightGroup.className = 'detail__weight-group';
      var wLabel = document.createElement('label');
      wLabel.textContent = '节点权重';
      var wInput = document.createElement('input');
      wInput.type = 'number';
      wInput.className = 'weight-input';
      wInput.min = '1';
      wInput.max = '99';
      wInput.value = node.weight;
      wInput.setAttribute('data-action', 'setNodeWeight');
      wInput.setAttribute('data-node-id', node.id);
      weightGroup.appendChild(wLabel);
      weightGroup.appendChild(wInput);
      headerRight.appendChild(weightGroup);

      if (!node.locked) {
        var delBtn = document.createElement('button');
        delBtn.className = 'btn btn--danger btn--sm';
        delBtn.setAttribute('data-action', 'detailDeleteNode');
        delBtn.setAttribute('data-node-id', node.id);
        delBtn.textContent = '删除节点';
        headerRight.appendChild(delBtn);
      }

      header.appendChild(info);
      header.appendChild(headerRight);
      panel.appendChild(header);

      // Tasks
      var tasks = document.createElement('div');
      tasks.className = 'detail__tasks';

      var title = document.createElement('div');
      title.className = 'detail__tasks-title';
      title.textContent = '子任务列表 (' + node.tasks.length + ')';
      tasks.appendChild(title);

      if (node.tasks.length === 0) {
        var emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.textContent = '暂无子任务，请在下方添加';
        tasks.appendChild(emptyState);
      } else {
        node.tasks.forEach(function(task) {
          var tpl = tplCache.taskItem.content.cloneNode(true);
          var item = tpl.querySelector('.task-item');
          item.setAttribute('data-task-id', task.id);
          item.setAttribute('data-node-id', node.id);
          if (task.done) item.classList.add('task-item--done');

          var cb = item.querySelector('.task-item__checkbox');
          cb.checked = task.done;
          cb.setAttribute('data-action', 'toggleTask');
          cb.setAttribute('data-task-id', task.id);
          cb.setAttribute('data-node-id', node.id);

          item.querySelector('.task-item__text').textContent = task.text;

          var wInp = item.querySelector('.task-item__weight');
          wInp.value = task.weight;
          wInp.setAttribute('data-action', 'setTaskWeight');
          wInp.setAttribute('data-task-id', task.id);
          wInp.setAttribute('data-node-id', node.id);

          var dBtn = item.querySelector('.task-item__delete');
          dBtn.setAttribute('data-task-id', task.id);
          dBtn.setAttribute('data-node-id', node.id);

          tasks.appendChild(tpl);
        });
      }
      panel.appendChild(tasks);

      // Add-task form
      var form = document.createElement('div');
      form.className = 'add-task-form';
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'add-task-form__input';
      input.placeholder = '输入新任务名称后按 Enter 或点击添加';
      input.setAttribute('data-action', 'taskInput');
      input.setAttribute('data-node-id', node.id);
      input.id = 'add-task-input';
      var addBtn = document.createElement('button');
      addBtn.className = 'btn btn--success btn--sm';
      addBtn.setAttribute('data-action', 'addTask');
      addBtn.setAttribute('data-node-id', node.id);
      addBtn.textContent = '+ 添加';
      form.appendChild(input);
      form.appendChild(addBtn);
      panel.appendChild(form);

      container.textContent = '';
      container.appendChild(panel);

      if (Renderer._restoreFocus) {
        Renderer._restoreFocus = false;
        var taskInput = document.getElementById('add-task-input');
        if (taskInput) taskInput.focus();
      }
    },

    renderActivityLog: function() {
      var s = State.get();
      var container = document.getElementById('activity-log-container');
      var fragment = document.createDocumentFragment();
      var logs = s.activityLog.slice().reverse();

      if (logs.length === 0) {
        var empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = '暂无动态记录';
        fragment.appendChild(empty);
      } else {
        logs.forEach(function(entry) {
          var tpl = tplCache.logEntry.content.cloneNode(true);
          var el = tpl.querySelector('.log-entry');
          var iconEl = el.querySelector('.log-entry__icon');
          if (entry.done) {
            iconEl.textContent = '\u2713';
            iconEl.classList.add('log-entry__icon--done');
          } else {
            iconEl.textContent = '\u21A9';
            iconEl.classList.add('log-entry__icon--undone');
          }
          el.querySelector('.log-entry__text').textContent = entry.taskText;
          el.querySelector('.log-entry__node').textContent = entry.nodeName;
          try {
            var d = new Date(entry.time);
            el.querySelector('.log-entry__time').textContent = d.toLocaleString('zh-CN', {
              month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
            });
          } catch (e) {
            el.querySelector('.log-entry__time').textContent = entry.time;
          }
          fragment.appendChild(tpl);
        });
      }
      container.textContent = '';
      container.appendChild(fragment);
    },

    _restoreFocus: false
  };

  // ===================================================================
  // 7. Inline Edit — Project Name, Owner, Node Fields
  // ===================================================================

  var InlineEdit = {
    startTitleEdit: function() {
      var el = document.getElementById('header-title');
      var current = State.get().projectName;
      var input = document.createElement('input');
      input.type = 'text';
      input.value = current;
      input.className = 'inline-edit-input inline-edit-input--title';

      el.textContent = '';
      el.appendChild(input);
      input.focus();
      input.select();

      var commit = function() {
        var val = input.value.trim();
        if (!val) {
          el.textContent = current;
          el.classList.add('shake');
          setTimeout(function() { el.classList.remove('shake'); }, 350);
          return;
        }
        State.updateProjectName(val);
      };

      input.addEventListener('blur', commit, { once: true });
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') {
          input.removeEventListener('blur', commit);
          el.textContent = current;
        }
      });
    },

    startOwnerEdit: function() {
      var el = document.getElementById('header-owner');
      var current = State.get().owner;
      var input = document.createElement('input');
      input.type = 'text';
      input.value = current;
      input.className = 'inline-edit-input inline-edit-input--owner';

      el.textContent = '';
      el.appendChild(input);
      input.focus();
      input.select();

      var commit = function() {
        var val = input.value.trim();
        if (!val) {
          el.textContent = current;
          el.classList.add('shake');
          setTimeout(function() { el.classList.remove('shake'); }, 350);
          return;
        }
        State.updateProjectOwner(val);
      };

      input.addEventListener('blur', commit, { once: true });
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') {
          input.removeEventListener('blur', commit);
          el.textContent = current;
        }
      });
    },

    startNodeFieldEdit: function(card, fieldType) {
      var nodeId = card.getAttribute('data-node-id');
      var node = _findNode(nodeId);
      if (!node) return;

      var field = card.querySelector('[data-field="' + fieldType + '"]');
      if (!field) return;
      var current = fieldType === 'name' ? node.name : node.ownerName;

      var input = document.createElement('input');
      input.type = 'text';
      input.value = current;
      input.style.cssText = 'width:100%;font-size:inherit;font-weight:inherit;border:1px solid var(--color-primary);border-radius:3px;padding:1px 4px;outline:none;';
      field.textContent = '';
      field.appendChild(input);
      input.focus();
      input.select();

      var commit = function() {
        var val = input.value.trim();
        if (!val) {
          field.textContent = current;
          return;
        }
        if (fieldType === 'name') {
          State.updateNodeName(nodeId, val);
        } else {
          State.updateNodeOwner(nodeId, val);
        }
      };

      input.addEventListener('blur', commit, { once: true });
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') {
          input.removeEventListener('blur', commit);
          field.textContent = current;
        }
      });
      // Prevent drag from starting when typing
      input.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
    }
  };

  // ===================================================================
  // 8. Event Handlers
  // ===================================================================

  var pendingInsertIndex = null;
  var pendingConfirmCb = null;

  var Handlers = {
    init: function() {
      var header = document.getElementById('app-header');
      var canvas = document.getElementById('pipeline-canvas');
      var detail = document.getElementById('detail-container');
      var dialogAdd = document.getElementById('dialog-add-node');
      var dialogConfirm = document.getElementById('dialog-confirm');

      // Header: inline edit project name
      document.getElementById('header-title').addEventListener('click', function(e) {
        // Don't trigger if already editing (input inside)
        if (e.target.tagName === 'INPUT') return;
        InlineEdit.startTitleEdit();
      });

      // Header: inline edit owner
      document.getElementById('header-owner').addEventListener('click', function(e) {
        if (e.target.tagName === 'INPUT') return;
        InlineEdit.startOwnerEdit();
      });

      // Header: action buttons
      header.addEventListener('click', function(e) {
        var target = e.target.closest('[data-action]');
        if (!target) return;
        if (target.getAttribute('data-action') === 'resetProgress') {
          Handlers.showConfirm('重置进度', '确定要重置所有子任务的完成状态吗？节点结构和权重将保留。', function() {
            State.resetProgress();
          });
        }
      });

      // Canvas: click to select node
      canvas.addEventListener('click', function(e) {
        if (drag.moved) return; // Ignore clicks after drag

        // Handle ＋ insert buttons
        var insertBtn = e.target.closest('[data-action="insertBefore"], [data-action="insertAfter"]');
        if (insertBtn) {
          var card = insertBtn.closest('.node-card');
          var nodeId = card.getAttribute('data-node-id');
          var idx = _findNodeIndex(nodeId);
          if (insertBtn.getAttribute('data-action') === 'insertBefore') {
            pendingInsertIndex = idx;
          } else {
            pendingInsertIndex = idx + 1;
          }
          Handlers.showAddNodeDialog();
          return;
        }

        // Handle delete button on card
        var delBtn = e.target.closest('[data-action="deleteNode"]');
        if (delBtn) {
          var nodeCard = delBtn.closest('.node-card');
          var delNodeId = nodeCard.getAttribute('data-node-id');
          var delNode = _findNode(delNodeId);
          if (delNode && !delNode.locked) {
            Handlers.showConfirm('删除节点', '确定要删除节点「' + delNode.name + '」吗？该节点下的所有子任务将一并删除。', function() {
              State.removeNode(delNodeId);
            });
          }
          return;
        }

        // Handle owner button click
        var ownerBtn = e.target.closest('[data-action="openProfile"]');
        if (ownerBtn) {
          var ownerName = ownerBtn.getAttribute('data-owner');
          if (ownerName) OwnerRegistry.openProfile(ownerName);
          return;
        }

        // Select node
        var nodeCard = e.target.closest('.node-card');
        if (nodeCard) {
          var nid = nodeCard.getAttribute('data-node-id');
          if (nid) State.selectNode(nid);
        }
      });

      // Canvas: double-click to inline edit node fields
      canvas.addEventListener('dblclick', function(e) {
        var nameField = e.target.closest('[data-field="name"]');
        if (nameField) {
          var card = nameField.closest('.node-card');
          if (card) InlineEdit.startNodeFieldEdit(card, 'name');
          return;
        }
        var ownerField = e.target.closest('[data-field="ownerName"]');
        if (ownerField) {
          var card2 = ownerField.closest('.node-card');
          if (card2) InlineEdit.startNodeFieldEdit(card2, 'ownerName');
          return;
        }
      });

      // Canvas: keyboard navigation
      canvas.addEventListener('keydown', function(e) {
        var card = e.target.closest('.node-card');
        if (!card) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          State.selectNode(card.getAttribute('data-node-id'));
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          var cards = Array.from(canvas.querySelectorAll('.node-card'));
          var idx = cards.indexOf(card);
          var next = e.key === 'ArrowRight' ? idx + 1 : idx - 1;
          if (next >= 0 && next < cards.length) cards[next].focus();
        }
      });

      // Detail: click delegation
      detail.addEventListener('click', function(e) {
        var target = e.target.closest('[data-action]');
        if (!target) return;
        var action = target.getAttribute('data-action');
        var nodeId = target.getAttribute('data-node-id');
        var taskId = target.getAttribute('data-task-id');

        if (action === 'deleteTask') {
          State.removeTask(nodeId, taskId);
        } else if (action === 'addTask') {
          Handlers.handleAddTask(nodeId);
        } else if (action === 'detailDeleteNode') {
          var node = _findNode(nodeId);
          if (node && !node.locked) {
            Handlers.showConfirm('删除节点', '确定要删除节点「' + node.name + '」吗？该节点下的所有子任务将一并删除。', function() {
              State.removeNode(nodeId);
            });
          }
        }
      });

      // Detail: change delegation (checkbox, weight inputs)
      detail.addEventListener('change', function(e) {
        var target = e.target;
        var action = target.getAttribute('data-action');
        if (!action) return;
        var nodeId = target.getAttribute('data-node-id');
        var taskId = target.getAttribute('data-task-id');

        if (action === 'toggleTask') {
          State.toggleTask(nodeId, taskId);
        } else if (action === 'setTaskWeight') {
          State.setTaskWeight(nodeId, taskId, target.value);
        } else if (action === 'setNodeWeight') {
          State.setNodeWeight(nodeId, target.value);
        }
      });

      // Detail: Enter key for task input
      detail.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && e.target.getAttribute('data-action') === 'taskInput') {
          e.preventDefault();
          Handlers.handleAddTask(e.target.getAttribute('data-node-id'));
        }
      });

      // Profile drawer: close + editable fields
      document.addEventListener('click', function(e) {
        if (e.target.closest('[data-action="closeProfile"]')) {
          OwnerRegistry.closeProfile();
          return;
        }
        // Click on editable profile field → inline edit
        var editableField = e.target.closest('.profile-drawer__value--editable');
        if (editableField && e.target.tagName !== 'INPUT') {
          OwnerRegistry.startFieldEdit(editableField);
        }
      });

      // Add-node dialog
      dialogAdd.addEventListener('close', function() {
        if (dialogAdd.returnValue === 'confirm') {
          Handlers.handleAddNodeConfirm();
        }
      });

      // Cancel buttons in dialogs
      document.addEventListener('click', function(e) {
        var target = e.target.closest('[data-action="cancelDialog"]');
        if (target) {
          var dialog = target.closest('dialog');
          if (dialog) dialog.close();
        }
      });

      // Confirm dialog action
      document.addEventListener('click', function(e) {
        if (e.target.closest('[data-action="confirmAction"]')) {
          if (pendingConfirmCb) { pendingConfirmCb(); pendingConfirmCb = null; }
          dialogConfirm.close();
        }
      });

      // State listeners
      document.addEventListener('pipeline:state-changed', function() { Renderer.renderAll(); });
      document.addEventListener('pipeline:selection-changed', function() { Renderer.renderAll(); });

      // Window resize → update canvas
      window.addEventListener('resize', function() { Renderer.updateCanvasSize(); });
    },

    handleAddTask: function(nodeId) {
      var input = document.getElementById('add-task-input');
      if (!input) return;
      var text = input.value.trim();
      if (!text) return;
      input.value = '';
      Renderer._restoreFocus = true;
      State.addTask(nodeId, text);
    },

    showAddNodeDialog: function() {
      var dialog = document.getElementById('dialog-add-node');
      document.getElementById('input-node-name').value = '';
      document.getElementById('input-node-owner').value = '';
      document.getElementById('input-node-weight').value = '1';
      dialog.returnValue = '';
      dialog.showModal();
      document.getElementById('input-node-name').focus();
    },

    handleAddNodeConfirm: function() {
      var name = document.getElementById('input-node-name').value.trim();
      var owner = document.getElementById('input-node-owner').value.trim();
      var weight = document.getElementById('input-node-weight').value;
      if (!name || !owner) return;

      var idx = pendingInsertIndex != null ? pendingInsertIndex : State.get().nodes.length - 1;
      var newId = State.addNode(name, owner, weight, idx);
      pendingInsertIndex = null;

      // Scroll new node into view
      setTimeout(function() {
        var newCard = document.querySelector('[data-node-id="' + newId + '"]');
        if (newCard) newCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }, 60);
    },

    showConfirm: function(title, message, cb) {
      document.getElementById('confirm-title').textContent = title;
      document.getElementById('confirm-message').textContent = message;
      pendingConfirmCb = cb;
      document.getElementById('dialog-confirm').showModal();
    }
  };

  // ===================================================================
  // 9. Initialization
  // ===================================================================

  document.addEventListener('DOMContentLoaded', function() {
    Renderer.cacheRefs();
    State.init();
    Handlers.init();
    Renderer.renderAll();
  });

})();
