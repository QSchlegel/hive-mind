export function ThemeScript() {
  const script = `(() => {
    const apply = (t) => document.documentElement.setAttribute('data-theme', t);
    const saved = localStorage.getItem('hm-theme');
    if (saved) { apply(saved); return; }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    apply(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', (e) => {
      if (!localStorage.getItem('hm-theme')) apply(e.matches ? 'dark' : 'light');
    });
  })();`;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
