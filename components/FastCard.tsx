"use client";

import FastLinkButton from "./FastLinkButton";

type FastCardProps = {
  href?: string;
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actionText?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  loadingText?: string;
  onClick?: () => void;
};

const baseClass =
  "group block w-full rounded-2xl border border-slate-800 bg-[#0b1220] p-6 text-left shadow-lg transition duration-150 hover:-translate-y-0.5 hover:border-teal-500 hover:bg-[#13213a] active:scale-[0.985] active:border-teal-400 [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950";

function CardInner({
  icon,
  title,
  description,
  actionText = "Open →",
  children,
  contentClassName = "",
}: Omit<FastCardProps, "href" | "className" | "loadingText" | "onClick">) {
  return (
    <div className={contentClassName}>
      {icon ? <div className="mb-5 text-4xl">{icon}</div> : null}

      <h2 className="text-2xl font-bold text-white transition group-hover:text-teal-300">
        {title}
      </h2>

      {description ? (
        <p className="mt-3 min-h-[48px] text-sm leading-6 text-slate-400">
          {description}
        </p>
      ) : null}

      {children}

      {actionText ? <p className="mt-5 font-bold text-teal-400">{actionText}</p> : null}
    </div>
  );
}

export default function FastCard({
  href,
  icon,
  title,
  description,
  actionText = "Open →",
  children,
  className = "",
  contentClassName = "",
  loadingText = "Opening...",
  onClick,
}: FastCardProps) {
  if (href) {
    return (
      <FastLinkButton
        href={href}
        loadingText={loadingText}
        onClick={onClick}
        className={`${baseClass} ${className}`}
      >
        <CardInner
          icon={icon}
          title={title}
          description={description}
          actionText={actionText}
          contentClassName={contentClassName}
        >
          {children}
        </CardInner>
      </FastLinkButton>
    );
  }

  return (
    <button type="button" onClick={onClick} data-fast-click="true" className={`${baseClass} ${className}`}>
      <CardInner
        icon={icon}
        title={title}
        description={description}
        actionText={actionText}
        contentClassName={contentClassName}
      >
        {children}
      </CardInner>
    </button>
  );
}
