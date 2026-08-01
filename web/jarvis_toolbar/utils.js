// ============================================================
// utils.js — Shared Utility Functions
// ------------------------------------------------------------
// Fungsi helper yang dipakai lintas modul.
// Tidak boleh ada dependency ke modul lain (kecuali Config).
// ============================================================

window.JT = window.JT || {};

JT.Utils = {

    /**
     * Deteksi mobile (untuk adjust ukuran tombol).
     */
    detectMobile() {
        const C = JT.Config;
        const isMobile = window.innerWidth < C.MOBILE_BREAKPOINT;
        JT.State.isMobile = isMobile;
        document.body.classList.toggle('jt-mobile', isMobile);
    },

    /**
     * Visual feedback: flash tombol.
     */
    flashButton(btn) {
        if (!btn) return;
        const C = JT.Config;
        btn.style.transition = 'none';
        btn.style.background = `rgba(${C.ACCENT_RGB}, 0.4)`;
        btn.style.transform = 'scale(0.95)';
        setTimeout(() => {
            btn.style.transition = '';
            btn.style.background = '';
            btn.style.transform = '';
        }, C.FLASH_DURATION);
    }
};
