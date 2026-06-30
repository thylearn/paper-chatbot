import ChatWindow from './components/ChatWindow';
import './App.css';

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>📚 文献查阅助手</h1>
        <p className="app-subtitle">基于 AI 工作流的学术文献检索与问答系统</p>
      </header>
      <main className="app-main">
        <ChatWindow />
      </main>
    </div>
  );
}

export default App;
