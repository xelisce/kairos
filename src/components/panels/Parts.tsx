/**
 * "a · b · c" where each piece moves to the next line as a whole
 * (e.g. a location stays together); a piece only breaks inside if it's wider than the line.
 */
export function Parts({ items }: { items: (string | undefined | false | null)[] }) {
  const parts = items.filter((x): x is string => !!x);
  return (
    <>
      {parts.map((p, i) => (
        <span key={i} className="part">
          {i > 0 ? `· ${p}` : p}
        </span>
      ))}
    </>
  );
}
