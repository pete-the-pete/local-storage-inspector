import styles from "./SearchBar.module.css";

interface SearchBarProps {
  query: string;
  onChange: (query: string) => void;
}

export function SearchBar({ query, onChange }: SearchBarProps) {
  return (
    <div className={styles.search}>
      <input
        className={styles.input}
        type="text"
        placeholder="Filter keys..."
        value={query}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
