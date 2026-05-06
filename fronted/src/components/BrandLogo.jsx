const BrandLogo = ({ compact = false, subtitle = 'Service Monitoring' }) => (
  <div className="flex items-center gap-3">
    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
      <img src="/favicon.svg" alt="Meon" className="h-7 w-7" />
    </div>
    <div className="min-w-0">
      <div className="flex items-center gap-0.5 text-2xl font-black leading-none tracking-tight">
        <span className="text-[#2f57c8]">ME</span>
        <span className="text-[#b22350]">ON</span>
      </div>
      {!compact && <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.24em] text-slate-400">{subtitle}</p>}
    </div>
  </div>
);

export default BrandLogo;
