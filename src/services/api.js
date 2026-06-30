/**
 * Dify Workflow API 服务
 * 通过 Vite 代理转发到 https://api.dify.ai/v1
 * 应用类型: Workflow — 输入参数: keyboard (必填)
 */

const API_BASE = '/api';
const AUTH_HEADER = `Bearer ${import.meta.env.VITE_DIFY_API_KEY}`;

/**
 * 通用 fetch 封装（自动带 Authorization）
 */
async function apiFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: AUTH_HEADER,
      ...options.headers,
    },
  });
}

/**
 * 运行工作流（流式 - SSE）
 * 支持 workflow 事件流: node_started/finished, workflow_started/finished, error
 */
export async function runWorkflowStream({
  query,
  user = 'paper-reader',
  inputs = {},
  onNodeUpdate,
  onComplete,
  onError,
}) {
  const response = await apiFetch(`${API_BASE}/workflows/run`, {
    method: 'POST',
    body: JSON.stringify({
      inputs: { keyboard: query, ...inputs },
      user,
      response_mode: 'streaming',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API 错误 ${response.status}: ${errorText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;

      const dataStr = line.slice(6).trim();
      if (!dataStr) continue;

      try {
        const data = JSON.parse(dataStr);

        switch (data.event) {
          case 'workflow_finished': {
            const output =
              data.data?.outputs?.output ||
              data.data?.outputs?.text ||
              [];
            onComplete &&
              onComplete({
                output,
                workflowRunId: data.data?.id,
                elapsedTime: data.data?.elapsed_time,
                totalTokens: data.data?.total_tokens,
                totalSteps: data.data?.total_steps,
              });
            break;
          }
          case 'node_finished': {
            const outs = data.data?.outputs || {};
            if (onNodeUpdate) {
              onNodeUpdate({
                nodeId: data.data?.node_id,
                title: data.data?.title,
                outputs: outs,
              });
            }
            break;
          }
          case 'error': {
            throw new Error(
              data.data?.message || '工作流执行出错'
            );
          }
          case 'workflow_started':
          case 'node_started':
          case 'ping':
          default:
            // 忽略中间事件
            break;
        }
      } catch (pe) {
        if (pe.message && pe.message.includes('工作流执行')) {
          throw pe;
        }
      }
    }
  }
}

/**
 * 运行工作流（阻塞式）
 */
export async function runWorkflowBlocking({
  query,
  user = 'paper-reader',
  inputs = {},
}) {
  const response = await apiFetch(`${API_BASE}/workflows/run`, {
    method: 'POST',
    body: JSON.stringify({
      inputs: { keyboard: query, ...inputs },
      user,
      response_mode: 'blocking',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API 错误 ${response.status}: ${errorText}`);
  }

  const result = await response.json();

  return {
    output: result.data?.outputs?.output || result.data?.outputs?.text || [],
    workflowRunId: result.data?.id,
    elapsedTime: result.data?.elapsed_time,
    totalTokens: result.data?.total_tokens,
    totalSteps: result.data?.total_steps,
    status: result.data?.status,
  };
}
