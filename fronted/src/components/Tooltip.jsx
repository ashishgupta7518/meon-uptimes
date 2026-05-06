const alignmentClass = {
  center: 'left-1/2 -translate-x-1/2',
  left: 'left-0',
  right: 'right-0',
};

const Tooltip = ({ content, children, align = 'center' }) => {
  if (!content) {
    return children;
  }

  return (
    <span className="group relative ">
      {children}
      <span
        className={`pointer-events-none absolute bottom-full z-30 mb-2 hidden whitespace-nowrap rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white shadow-xl group-hover:block group-focus-within:block ${alignmentClass[align] || alignmentClass.center}`}
        role="tooltip"
      >
        {content}
      </span>
    </span>
  );
};

export default Tooltip;
