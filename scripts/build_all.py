import re

# 1. Update modules/ui.js with About tab and About HUD button
with open("modules/ui.js") as f:
    ui_code = f.read()

# Add About button in HUD if not already present
if 'class="kiki-hud-btn kiki-hud-about"' not in ui_code:
    hud_ctrl_pattern = '<button type="button" class="kiki-hud-btn kiki-hud-ctrl"'
    about_btn_html = '<button type="button" class="kiki-hud-btn kiki-hud-about" style="background: rgba(255, 255, 255, 0.2) !important; border-radius: 12px !important; padding: 4px 10px !important; font-size: 12px !important; cursor: pointer !important; border: 1px solid rgba(255, 255, 255, 0.3) !important; color: #FFFFFF !important; font-weight: 600 !important; white-space: nowrap !important;" title="About & Hot-Update">ℹ️ About</button>\n        '
    ui_code = ui_code.replace(hud_ctrl_pattern, about_btn_html + hud_ctrl_pattern)

    bind_ctrl_pattern = 'bindHudButton(hud.querySelector(".kiki-hud-ctrl"), () => {'
    bind_about_code = """bindHudButton(hud.querySelector(".kiki-hud-about"), () => {
        showSettingsModal("about");
      });

      """
    ui_code = ui_code.replace(bind_ctrl_pattern, bind_about_code + bind_ctrl_pattern)

# Add About tab rendering in showSettingsModal
about_tab_html = """      } else if (activeTab === "about") {
        const cacheTime = localStorage.getItem("kiki_cache_time") || "Initial / Local";
        const cacheVer = localStorage.getItem("kiki_cache_version") || "1.2.1";
        const modulesList = ["core", "yomitan", "ai", "ui", "youtube"];
        const modStatus = modulesList.map(m => {
          const has = !!localStorage.getItem("kiki_mod_" + m);
          return `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;color:#CBD5E1;border-bottom:1px dashed rgba(255,255,255,0.08);">
            <span>• ${m}.js</span>
            <span style="color:${has ? '#34D399' : '#818CF8'};font-weight:600;">${has ? '已缓存 (Cached)' : '就绪 (Active)'}</span>
          </div>`;
        }).join("");

        contentHtml = `
          <div style="display: flex; flex-direction: column; gap: 12px; max-height: 420px; overflow-y: auto; padding-right: 4px;">
            <div style="background: rgba(99, 102, 241, 0.12); border: 1px solid rgba(165, 180, 252, 0.25); border-radius: 12px; padding: 12px 14px;">
              <div style="font-size: 16px; font-weight: 800; color: #FFF; display: flex; align-items: center; gap: 8px;">
                <span>✦ Kiki Immersion</span>
                <span style="background: linear-gradient(135deg, #6366F1, #8B5CF6); font-size: 11px; padding: 2px 7px; border-radius: 6px;">v${cacheVer}</span>
              </div>
              <div style="font-size: 12px; color: #94A3B8; margin-top: 4px; line-height: 1.45;">
                Touch & Mouse YouTube Immersion with Offline Yomitan, High-DPI Subtitles, AI Context & Hot-Reload Engine.
              </div>
            </div>

            <div style="background: rgba(255, 255, 255, 0.05); border-radius: 10px; padding: 10px 12px;">
              <div style="font-size: 12px; font-weight: 700; color: #E2E8F0; margin-bottom: 6px;">📦 已加载核心模块状态</div>
              ${modStatus}
              <div style="font-size: 11px; color: #94A3B8; margin-top: 8px;">
                缓存状态: <span style="color: #E2E8F0;">${escapeHtml(cacheTime)}</span>
              </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 8px;">
              <button type="button" id="kiki-hot-reload-btn" style="background: linear-gradient(135deg, #2563EB, #6366F1); color: #FFF; border: none; border-radius: 10px; padding: 10px 14px; font-size: 13px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 4px 12px rgba(37,99,235,0.35);">
                <span>⚡ 检查并重新从 GitHub 拉取缓存 (一键热更新)</span>
              </button>
              <button type="button" id="kiki-clear-cache-btn" style="background: rgba(255, 255, 255, 0.08); color: #CBD5E1; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 10px; padding: 8px 14px; font-size: 12px; font-weight: 600; cursor: pointer;">
                🗑 清空模块本地缓存
              </button>
              <a href="https://github.com/kekeqwq/Kiki-Immersion" target="_blank" rel="noopener" style="text-align: center; font-size: 12px; color: #818CF8; text-decoration: none; padding-top: 4px;">
                🔗 访问 GitHub 仓库 (kekeqwq/Kiki-Immersion)
              </a>
            </div>
          </div>
        `;
"""

if 'activeTab === "about"' not in ui_code:
    # Insert before the last else or closing of activeTab checks
    ui_code = ui_code.replace('} else {\n        contentHtml = `', about_tab_html + '} else if (activeTab === "ai") {\n        contentHtml = `')

# Tab buttons
old_tab_buttons = """<button type="button" class="kiki-tab-btn" data-tab="dict" style="background: ${activeTab === 'dict' ? '#2563EB' : 'rgba(255,255,255,0.08)'}; color: #FFF; border: none; border-radius: 8px; padding: 6px 14px; font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.15s;">📖 Dictionaries</button>
            <button type="button" class="kiki-tab-btn" data-tab="ai" style="background: ${activeTab === 'ai' ? '#6366F1' : 'rgba(255,255,255,0.08)'}; color: #FFF; border: none; border-radius: 8px; padding: 6px 14px; font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.15s;">🤖 AI Configuration</button>"""

new_tab_buttons = """<button type="button" class="kiki-tab-btn" data-tab="dict" style="background: ${activeTab === 'dict' ? '#2563EB' : 'rgba(255,255,255,0.08)'}; color: #FFF; border: none; border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.15s;">📖 词典</button>
            <button type="button" class="kiki-tab-btn" data-tab="ai" style="background: ${activeTab === 'ai' ? '#6366F1' : 'rgba(255,255,255,0.08)'}; color: #FFF; border: none; border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.15s;">🤖 AI 语境</button>
            <button type="button" class="kiki-tab-btn" data-tab="about" style="background: ${activeTab === 'about' ? '#10B981' : 'rgba(255,255,255,0.08)'}; color: #FFF; border: none; border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.15s;">ℹ️ 关于/热更</button>"""

ui_code = ui_code.replace(old_tab_buttons, new_tab_buttons)

# Event listeners for about tab
about_event_listeners = """
      if (activeTab === "about") {
        modal.querySelector("#kiki-hot-reload-btn")?.addEventListener("click", async (e) => {
          e.stopPropagation();
          const btn = modal.querySelector("#kiki-hot-reload-btn");
          if (btn) {
            btn.disabled = true;
            btn.innerHTML = "<span>⏳ 正在从 GitHub 拉取最新核心模块...</span>";
          }
          try {
            if (typeof window.__kiki_reload_modules === "function") {
              await window.__kiki_reload_modules(true);
            } else {
              const list = ["core", "yomitan", "ai", "ui", "youtube"];
              const base = "https://raw.githubusercontent.com/kekeqwq/Kiki-Immersion/main/modules/";
              await Promise.all(list.map(async (m) => {
                const r = await fetch(`${base}${m}.js?_t=${Date.now()}`);
                if (!r.ok) throw new Error(`HTTP ${r.status} on ${m}.js`);
                const t = await r.text();
                localStorage.setItem("kiki_mod_" + m, t);
              }));
              localStorage.setItem("kiki_cache_version", "1.2.1");
              localStorage.setItem("kiki_cache_time", new Date().toLocaleString());
              toast("✅ 核心组件已覆盖更新，正在重载...");
              setTimeout(() => location.reload(), 800);
            }
          } catch (err) {
            alert("更新失败: " + err.message);
            if (btn) {
              btn.disabled = false;
              btn.innerHTML = "<span>⚡ 检查并重新从 GitHub 拉取缓存 (一键热更新)</span>";
            }
          }
        });

        modal.querySelector("#kiki-clear-cache-btn")?.addEventListener("click", (e) => {
          e.stopPropagation();
          if (confirm("确定要清空本地缓存的 Kiki 核心模块吗？清空后将在下次刷新时重新从 GitHub 拉取。")) {
            ["core", "yomitan", "ai", "ui", "youtube"].forEach(m => localStorage.removeItem("kiki_mod_" + m));
            localStorage.removeItem("kiki_cache_time");
            toast("🗑 本地缓存已清空");
            renderModal();
          }
        });
      }
"""

if 'modal.querySelector("#kiki-hot-reload-btn")' not in ui_code:
    dict_active_check = 'if (activeTab === "dict") {'
    ui_code = ui_code.replace(dict_active_check, about_event_listeners + "\n      " + dict_active_check)

with open("modules/ui.js", "w") as f:
    f.write(ui_code)

print("modules/ui.js updated successfully with About & Hot-Reload tab!")
