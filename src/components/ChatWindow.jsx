import { useState, useRef, useEffect, useCallback } from 'react';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import { runWorkflowStream, runWorkflowBlocking } from '../services/api';
import './ChatWindow.css';

const USER_ID = 'paper-reader-' + Math.random().toString(36).slice(2, 8);

const WELCOME_MSG = {
  id: 'welcome',
  role: 'assistant',
  content:
    '你好！我是**文献查阅助手**，基于 AI 工作流为你检索和分析学术文献。\n\n' +
    '你可以问我：\n' +
    '- 📚 检索特定主题的学术论文\n' +
    '- 🔍 查找最新研究进展\n' +
    '- 📝 总结研究领域概况\n\n' +
    '请告诉我你想了解什么！',
  timestamp: Date.now(),
};

function ChatWindow() {
  const [messages, setMessages] = useState([WELCOME_MSG]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const messagesEndRef = useRef(null);
  const isStreamingRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, statusText, scrollToBottom]);

  const formatOutput = useCallback((output) => {
    if (!output) return '未获取到结果，请重试。';

    const items = Array.isArray(output) ? output : [output];

    // 过滤无效结果
    const valid = items.filter(
      (item) =>
        item &&
        typeof item === 'string' &&
        item.trim() !== '' &&
        item !== 'No good Arxiv Result was found'
    );

    if (valid.length === 0) {
      return (
        '## 未找到相关文献\n\n' +
        '很抱歉，当前查询未找到匹配的学术文献结果。\n\n' +
        '**建议：**\n' +
        '- 尝试使用更具体的关键词\n' +
        '- 使用英文关键词搜索效果可能更好\n' +
        '- 尝试不同的表达方式\n\n' +
        '请重新输入您的问题。'
      );
    }

    return valid
      .map((item, i) => {
        if (valid.length === 1) return item;
        return `### 📄 结果 ${i + 1}\n\n${item}`;
      })
      .join('\n\n---\n\n');
  }, []);

  const handleSend = useCallback(
    async (query) => {
      if (isLoading) return;

      const userMsg = {
        id: 'user-' + Date.now(),
        role: 'user',
        content: query,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);
      setStatusText('正在检索文献...');
      isStreamingRef.current = true;

      const assistantMsgId = 'assistant-' + Date.now();
      let hasReceivedStream = false;

      try {
        await runWorkflowStream({
          query,
          user: USER_ID,
          inputs: {},
          onNodeUpdate: (nodeInfo) => {
            // 显示当前执行步骤
            if (nodeInfo.title) {
              setStatusText(`正在执行: ${nodeInfo.title}...`);
            }
          },
          onComplete: (result) => {
            const content = formatOutput(result.output);

            if (!hasReceivedStream) {
              // 流式没有实时输出，直接显示最终结果
              setMessages((prev) => [
                ...prev,
                {
                  id: assistantMsgId,
                  role: 'assistant',
                  content,
                  timestamp: Date.now(),
                  metadata: result.totalTokens
                    ? `tokens: ${result.totalTokens} | 耗时: ${result.elapsedTime?.toFixed(1)}s`
                    : undefined,
                },
              ]);
            } else {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMsgId
                    ? { ...msg, content, timestamp: Date.now() }
                    : msg
                )
              );
            }
            setIsLoading(false);
            setStatusText('');
            isStreamingRef.current = false;
          },
          onError: (error) => {
            throw error;
          },
        });
      } catch (streamErr) {
        console.warn('流式请求失败，尝试阻塞模式:', streamErr.message);

        // 如果流式失败且还没添加 assistant 消息，先添加占位
        if (!hasReceivedStream) {
          setMessages((prev) => [
            ...prev,
            {
              id: assistantMsgId,
              role: 'assistant',
              content: '⏳ 正在查询中，请稍候...',
              timestamp: Date.now(),
            },
          ]);
          setStatusText('切换到同步查询模式...');
        }

        try {
          const result = await runWorkflowBlocking({
            query,
            user: USER_ID,
            inputs: {},
          });
          const content = formatOutput(result.output);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? {
                    ...msg,
                    content,
                    timestamp: Date.now(),
                    metadata: `tokens: ${result.totalTokens} | 耗时: ${result.elapsedTime?.toFixed(1)}s`,
                  }
                : msg
            )
          );
          setIsLoading(false);
          setStatusText('');
          isStreamingRef.current = false;
        } catch (blockErr) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? {
                    ...msg,
                    content: `## 请求出错\n\n${blockErr.message}\n\n请稍后重试或尝试其他问题。`,
                    timestamp: Date.now(),
                  }
                : msg
            )
          );
          setIsLoading(false);
          setStatusText('');
          isStreamingRef.current = false;
        }
      }
    },
    [isLoading, formatOutput]
  );

  const handleClear = useCallback(() => {
    if (isLoading) return;
    setMessages([{ ...WELCOME_MSG, timestamp: Date.now() }]);
  }, [isLoading]);

  return (
    <div className="chat-window">
      {/* 顶部工具栏 */}
      <div className="chat-toolbar">
        <span className="toolbar-title">💬 对话</span>
        <div className="toolbar-actions">
          {statusText && (
            <span className="status-text">{statusText}</span>
          )}
          <button
            className="clear-button"
            onClick={handleClear}
            disabled={isLoading || messages.length <= 1}
            title="清空对话"
          >
            🗑️ 清空
          </button>
        </div>
      </div>

      {/* 消息列表 */}
      <div className="chat-messages">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        {isLoading && (
          <div className="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入框 */}
      <ChatInput onSend={handleSend} disabled={isLoading} />
    </div>
  );
}

export default ChatWindow;
