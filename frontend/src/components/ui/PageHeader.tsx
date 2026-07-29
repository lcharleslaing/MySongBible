type PageHeaderProps = {
  eyebrow?: string;
  title?: string;
  description?: string;
};

export function PageHeader({ eyebrow, title, description }: PageHeaderProps) {
  if (!eyebrow && !title && !description) {
    return null;
  }

  return (
    <div className="space-y-3">
      {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.35em] text-primary">{eyebrow}</p> : null}
      <div className="space-y-2">
        {title ? <h1 className="text-3xl font-bold text-base-content sm:text-4xl">{title}</h1> : null}
        {description ? <p className="max-w-3xl text-sm text-base-content/70 sm:text-base">{description}</p> : null}
      </div>
    </div>
  );
}
