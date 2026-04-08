const useCases = [
  'Financial Services',
  'Government',
  'Media & Broadcasting',
  'Legal',
  'Healthcare',
];

export default function TrustBar() {
  return (
    <section className="relative border-y border-white/[0.04] bg-[#07090E]/80 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center gap-3 py-4 overflow-x-auto scrollbar-hide">
          <span className="font-mono text-[11px] text-[#484F58] uppercase tracking-wider whitespace-nowrap flex-shrink-0">
            Built for
          </span>
          <div className="flex items-center gap-2">
            {useCases.map((uc) => (
              <span
                key={uc}
                className="font-mono text-[11px] text-[#8B949E] uppercase tracking-wider whitespace-nowrap px-3 py-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] flex-shrink-0"
              >
                {uc}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
