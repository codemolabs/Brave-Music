/**
 * WinUI 3 & Microsoft Fluent UI Popup and Dialog Library
 * Compliant with microsoft-ui-xaml (WinUI 3 / Windows App SDK)
 * Designed for Brave Music Windows & Cross-Platform Suite
 * Provider: COSL Codemo Open Source Labs (https://github.com/codemolabs)
 */

(function (window, document) {
  'use strict';

  // ContentDialog Result enumeration matching WinUI 3
  const ContentDialogResult = {
    None: 0,
    Primary: 1,
    Secondary: 2
  };

  /**
   * WinUI 3 ContentDialog Implementation
   * Requires XamlRoot association before calling showAsync()
   * (Throws InvalidOperationException if dialog is not associated with a visual tree)
   */
  class WinUI3ContentDialog {
    constructor(options = {}) {
      this.title = options.title || 'Notification';
      this.content = options.content || '';
      this.primaryButtonText = options.primaryButtonText || null;
      this.secondaryButtonText = options.secondaryButtonText || null;
      this.closeButtonText = options.closeButtonText || 'Close';
      this.defaultButton = options.defaultButton || 'Primary';
      this.iconSvg = options.iconSvg || null;
      this.severity = options.severity || 'info'; // info, success, warning, error
      
      // Critical WinUI 3 Requirement: XamlRoot must be set
      this.xamlRoot = options.xamlRoot || null;
      
      this._backdrop = null;
      this._dialogCard = null;
      this._resolvePromise = null;
    }

    /**
     * Show dialog asynchronously, returning a Promise<ContentDialogResult>
     */
    async showAsync() {
      // 1. Strict WinUI 3 Visual Tree validation
      if (!this.xamlRoot) {
        // In web / electron context, auto-resolve to document.body if visual tree root is not explicitly set,
        // but log full architectural diagnostic conforming to WinUI 3 specifications.
        console.warn(
          '[WinUI 3 Diagnostic] ContentDialog.XamlRoot was not explicitly set before ShowAsync(). ' +
          'In WinUI 3 C#, this throws System.InvalidOperationException. Auto-associating with visual tree root: document.body.'
        );
        this.xamlRoot = document.body;
      }

      if (!(this.xamlRoot instanceof HTMLElement)) {
        throw new Error(
          'InvalidOperationException: The ContentDialog must be associated with a valid live visual tree root element (dialog.xamlRoot).'
        );
      }

      return new Promise((resolve) => {
        this._resolvePromise = resolve;
        this._render();
        requestAnimationFrame(() => {
          if (this._backdrop) {
            this._backdrop.classList.add('visible');
          }
        });
      });
    }

    hide(result = ContentDialogResult.None) {
      if (this._backdrop) {
        this._backdrop.classList.remove('visible');
        setTimeout(() => {
          if (this._backdrop && this._backdrop.parentNode) {
            this._backdrop.parentNode.removeChild(this._backdrop);
          }
          this._backdrop = null;
          if (this._resolvePromise) {
            this._resolvePromise(result);
            this._resolvePromise = null;
          }
        }, 220);
      }
    }

    _render() {
      // Clean any existing dialog backdrops
      const existing = document.getElementById('winui-active-dialog');
      if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing);
      }

      const backdrop = document.createElement('div');
      backdrop.className = 'winui-dialog-backdrop';
      backdrop.id = 'winui-active-dialog';
      backdrop.setAttribute('role', 'dialog');
      backdrop.setAttribute('aria-modal', 'true');

      const card = document.createElement('div');
      card.className = 'winui-content-dialog';

      // Header
      const header = document.createElement('div');
      header.className = 'winui-dialog-header';

      if (this.iconSvg) {
        const iconWrap = document.createElement('span');
        iconWrap.className = 'winui-dialog-icon';
        iconWrap.innerHTML = this.iconSvg;
        header.appendChild(iconWrap);
      } else {
        const defaultIcon = document.createElement('span');
        defaultIcon.className = 'winui-dialog-icon';
        defaultIcon.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
        header.appendChild(defaultIcon);
      }

      const titleEl = document.createElement('h3');
      titleEl.className = 'winui-dialog-title';
      titleEl.textContent = this.title;
      header.appendChild(titleEl);
      card.appendChild(header);

      // Body
      const body = document.createElement('div');
      body.className = 'winui-dialog-body';
      if (typeof this.content === 'string') {
        body.innerHTML = this.content;
      } else if (this.content instanceof HTMLElement) {
        body.appendChild(this.content);
      }
      card.appendChild(body);

      // Footer Actions
      const footer = document.createElement('div');
      footer.className = 'winui-dialog-footer';

      if (this.secondaryButtonText) {
        const secBtn = document.createElement('button');
        secBtn.className = 'winui-btn winui-btn-secondary';
        secBtn.textContent = this.secondaryButtonText;
        secBtn.addEventListener('click', () => this.hide(ContentDialogResult.Secondary));
        footer.appendChild(secBtn);
      }

      if (this.primaryButtonText) {
        const primBtn = document.createElement('button');
        primBtn.className = 'winui-btn winui-btn-primary';
        primBtn.textContent = this.primaryButtonText;
        primBtn.addEventListener('click', () => this.hide(ContentDialogResult.Primary));
        footer.appendChild(primBtn);
      }

      if (this.closeButtonText) {
        const closeBtn = document.createElement('button');
        closeBtn.className = 'winui-btn winui-btn-close';
        closeBtn.textContent = this.closeButtonText;
        closeBtn.addEventListener('click', () => this.hide(ContentDialogResult.None));
        footer.appendChild(closeBtn);
      }

      card.appendChild(footer);
      backdrop.appendChild(card);
      this.xamlRoot.appendChild(backdrop);

      this._backdrop = backdrop;
      this._dialogCard = card;
    }
  }

  /**
   * WinUI 3 Suite "Shows Downloading" Progress Suite
   * Simulates and controls the Windows App SDK package downloading and deployment flow
   */
  class WinUI3DownloadSuite {
    constructor() {
      this.dialog = null;
      this.progressBar = null;
      this.percentText = null;
      this.speedText = null;
      this.transferredText = null;
      this.etaText = null;
      this.statusText = null;
      this.isOpen = false;
    }

    showSuite({ title = 'Brave Music Desktop Package Suite', version = '1.0.18' } = {}) {
      if (this.isOpen) return;
      this.isOpen = true;

      const content = document.createElement('div');
      content.className = 'winui-download-suite-body';

      content.innerHTML = `
        <div class="winui-suite-hero">
          <div class="winui-suite-logo">
            <img src="assets/app-icon.svg" alt="Brave Music Logo" onerror="this.src='assets/icons/yt-music.svg'">
          </div>
          <div class="winui-suite-meta">
            <h4>Brave Music for Windows (x64)</h4>
            <p>Codemo Open Source Labs • Release v${version} • Native Package</p>
          </div>
        </div>

        <p style="font-size: 13.5px; color: var(--winui-text-secondary); margin-bottom: 8px;">
          Downloading high-bitrate offline audio engine and Windows native desktop runtime libraries…
        </p>

        <!-- WinUI 3 Progress Bar -->
        <div class="winui-progressbar-wrap">
          <div class="winui-progressbar-track" id="winui-suite-track">
            <div class="winui-progressbar-fill" id="winui-suite-fill" style="width: 0%;"></div>
          </div>
        </div>

        <!-- Real-time Transfer Statistics Grid -->
        <div class="winui-stats-grid">
          <div class="winui-stat-box">
            <span class="winui-stat-label">Progress</span>
            <span class="winui-stat-val" id="winui-suite-percent">0%</span>
          </div>
          <div class="winui-stat-box">
            <span class="winui-stat-label">Speed</span>
            <span class="winui-stat-val" id="winui-suite-speed">-- MB/s</span>
          </div>
          <div class="winui-stat-box">
            <span class="winui-stat-label">Time Remaining</span>
            <span class="winui-stat-val" id="winui-suite-eta">Estimating…</span>
          </div>
        </div>

        <!-- Current Status & Integrity Badges -->
        <p id="winui-suite-status" style="font-size: 12.5px; color: var(--winui-text-tertiary); margin: 6px 0 12px 0;">
          Connecting to Codemo verified release distribution network…
        </p>

        <div class="winui-badges-row">
          <span class="winui-badge-pill"><span class="winui-badge-dot"></span> COSL Verified</span>
          <span class="winui-badge-pill"><span class="winui-badge-dot"></span> Widevine DRM Ready</span>
          <span class="winui-badge-pill"><span class="winui-badge-dot"></span> Zero Telemetry / 100% Local</span>
          <span class="winui-badge-pill"><span class="winui-badge-dot"></span> WinUI 3 Native</span>
        </div>
      `;

      this.dialog = new WinUI3ContentDialog({
        title,
        content,
        primaryButtonText: null,
        secondaryButtonText: 'Cancel',
        closeButtonText: 'Background',
        xamlRoot: document.body
      });

      this.dialog.showAsync().then((result) => {
        this.isOpen = false;
        // Reset taskbar progress on close
        window.braveApi?.setTaskbarProgress(-1);
      });

      // Cache DOM element pointers
      setTimeout(() => {
        this.progressBar = document.getElementById('winui-suite-fill');
        this.percentText = document.getElementById('winui-suite-percent');
        this.speedText = document.getElementById('winui-suite-speed');
        this.etaText = document.getElementById('winui-suite-eta');
        this.statusText = document.getElementById('winui-suite-status');
      }, 50);
    }

    updateProgress({ percent = 0, speed = '3.8 MB/s', transferred = '42 MB', eta = '12s', status = 'Downloading package…' } = {}) {
      if (!this.isOpen) return;

      const p = Math.min(100, Math.max(0, Math.round(percent)));
      if (this.progressBar) this.progressBar.style.width = `${p}%`;
      if (this.percentText) this.percentText.textContent = `${p}%`;
      if (this.speedText) this.speedText.textContent = speed;
      if (this.etaText) this.etaText.textContent = eta;
      if (this.statusText) this.statusText.textContent = status;

      // Update Windows Taskbar Progress
      window.braveApi?.setTaskbarProgress(p / 100);
    }

    complete({ message = 'Package successfully downloaded and registered for current user!' } = {}) {
      if (!this.isOpen) return;
      this.updateProgress({ percent: 100, speed: 'Complete', eta: '0s', status: message });
      window.braveApi?.setTaskbarProgress(-1);
      setTimeout(() => {
        this.close();
      }, 1600);
    }

    close() {
      if (this.dialog) {
        this.dialog.hide(ContentDialogResult.None);
        this.isOpen = false;
      }
    }
  }

  // Global Singleton instance
  const downloadSuite = new WinUI3DownloadSuite();

  /**
   * Helper: Show WinUI 3 ContentDialog
   */
  async function showContentDialog(options) {
    const dialog = new WinUI3ContentDialog(options);
    return await dialog.showAsync();
  }

  /**
   * Detect Platform and Apply Windows Native UI UX if on Windows
   */
  async function initPlatform() {
    let isWindows = false;
    try {
      if (window.braveApi?.getPlatformInfo) {
        const info = await window.braveApi.getPlatformInfo();
        isWindows = !!(info && info.isWindows);
      } else {
        isWindows = navigator.userAgent.includes('Windows') || navigator.platform.includes('Win');
      }
    } catch (e) {
      isWindows = navigator.userAgent.includes('Windows');
    }

    if (isWindows) {
      document.body.classList.add('platform-windows');
      console.log('[WinUI 3] Initialized Windows Native UI UX and Microsoft UI XAML element styling.');
    }
  }

  // Auto-init on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPlatform);
  } else {
    initPlatform();
  }

  // Export to global window namespace
  window.winui = {
    ContentDialogResult,
    ContentDialog: WinUI3ContentDialog,
    showContentDialog,
    downloadSuite,
    showDownloadSuite: (opts) => downloadSuite.showSuite(opts),
    updateDownloadSuite: (opts) => downloadSuite.updateProgress(opts)
  };

})(window, document);

