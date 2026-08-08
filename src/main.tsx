import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadGameData } from './data';
import { App } from './ui/App';
import './styles.css';

const root = createRoot(document.getElementById('root')!);

// データ検証に失敗した場合は明示的に停止してエラーを表示する（14.4節）
try {
  const data = loadGameData();
  root.render(
    <StrictMode>
      <App data={data} />
    </StrictMode>,
  );
} catch (e) {
  root.render(
    <div style={{ padding: 16, fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: '#c0392b' }}>
      <h2>データ検証エラー</h2>
      <p>{e instanceof Error ? e.message : String(e)}</p>
    </div>,
  );
}
