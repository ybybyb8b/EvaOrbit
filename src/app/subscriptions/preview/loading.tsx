import styles from "./preview.module.css";

export default function PreviewLoading() {
  return <div className={`page ${styles.page}`} aria-busy="true"><header className={styles.header}><h1>Subscriptions</h1></header><p role="status">正在读取订阅账簿 · Loading your ledger…</p></div>;
}
