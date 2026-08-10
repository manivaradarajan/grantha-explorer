interface AppWordmarkProps extends React.ComponentPropsWithoutRef<"span"> {
  /** Extra classes merged onto the wordmark span (e.g. a vertical nudge). */
  className?: string;
}

export default function AppWordmark({
  className,
  ...rest
}: AppWordmarkProps) {
  return (
    <span
      className={`font-wordmark select-none text-2xl font-medium text-gray-900 leading-none whitespace-nowrap${
        className ? ` ${className}` : ""
      }`}
      {...rest}
    >
      ग्रन्थपरिशीलकः
      <span className="text-gray-400 font-normal mx-2 text-xl">&gt;</span>
      <span className="text-gray-500 font-normal">उपनिषदः</span>
    </span>
  );
}
