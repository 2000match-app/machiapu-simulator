// スマホの枠（.phone-scroll）の中をスクロールしている（2026-11-14：PCでもスマホの画面にした）ので、上へ戻すのは枠の中
export function scrollToTop(): void {
  document.getElementById('phone-scroll')?.scrollTo(0, 0);
  window.scrollTo(0, 0);
}
