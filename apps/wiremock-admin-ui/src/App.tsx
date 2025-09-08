import { useEffect, useState } from 'react';
import { createWiremockClient, WiremockClient } from 'wiremock-sdk-extra';

type Conn = { baseUrl: string; user?: string; pass?: string };

const exampleStub = {
  request: { method: 'GET', url: '/hello' },
  response: { status: 200, jsonBody: { ok: true }, headers: { 'Content-Type': 'application/json' } },
  metadata: { app: 'ui' },
  persistent: true,
};

export default function App() {
  const [conn, setConn] = useState<Conn>({ baseUrl: 'http://localhost:8080' });
  const [client, setClient] = useState<WiremockClient | null>(null);
  const [mappings, setMappings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [recording, setRecording] = useState<any | null>(null);

  const connect = () => {
    const c = createWiremockClient(conn);
    setClient(c);
    setMsg('connected');
  };

  const notify = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(null), 2500);
  };

  const loadMappings = async () => {
    if (!client) return;
    setLoading(true);
    try {
      const res = await client.listMappings(100, 0);
      const list = (res as any).mappings || (res as any).mappingsResult || (res as any).items || [];
      setMappings(list.map((x: any) => x));
    } catch (e: any) {
      notify('error: ' + (e?.message || 'loadMappings'));
    } finally {
      setLoading(false);
    }
  };

  const createSample = async () => {
    if (!client) return;
    try {
      await client.createMapping(exampleStub);
      notify('stub created');
      await loadMappings();
    } catch (e: any) {
      notify('error: create');
    }
  };

  const deleteStub = async (id: string) => {
    if (!client) return;
    try {
      await client.deleteMapping(id);
      notify('deleted');
      await loadMappings();
    } catch (e: any) {
      notify('error: delete');
    }
  };

  const reset = async () => {
    if (!client) return;
    await client.resetMappings();
    notify('reset');
    await loadMappings();
  };
  const persist = async () => {
    if (!client) return;
    await client.persistMappings();
    notify('persisted');
  };

  const countHello = async () => {
    if (!client) return;
    const res = await client.countRequests({ method: 'GET', url: '/hello' } as any);
    setCount((res as any).count ?? null);
  };

  const startRec = async () => {
    if (!client) return;
    await client.startRecording({ targetBaseUrl: 'https://httpbin.org' } as any);
    const st = await client.recordingStatus();
    setRecording(st);
    notify('recording started');
  };
  const stopRec = async () => {
    if (!client) return;
    await client.stopRecording();
    const st = await client.recordingStatus();
    setRecording(st);
    notify('recording stopped');
  };
  const snapshot = async () => {
    if (!client) return;
    await client.snapshot({});
    notify('snapshot done');
    await loadMappings();
  };

  useEffect(() => {
    if (client) loadMappings();
  }, [client]);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="p-4 border-b bg-white">
        <h1 className="text-2xl font-semibold">WireMock Admin UI</h1>
      </header>

      <main className="p-4 grid gap-4">
        <section className="bg-white rounded-2xl shadow p-4 grid gap-2">
          <h2 className="text-xl font-medium">Connection</h2>
          <div className="grid md:grid-cols-4 gap-2">
            <input
              className="border p-2 rounded"
              placeholder="Base URL e.g. http://localhost:8080"
              value={conn.baseUrl}
              onChange={(e) => setConn((v) => ({ ...v, baseUrl: e.target.value }))}
            />
            <input
              className="border p-2 rounded"
              placeholder="User (optional)"
              value={conn.user || ''}
              onChange={(e) => setConn((v) => ({ ...v, user: e.target.value || undefined }))}
            />
            <input
              className="border p-2 rounded"
              placeholder="Pass (optional)"
              type="password"
              value={conn.pass || ''}
              onChange={(e) => setConn((v) => ({ ...v, pass: e.target.value || undefined }))}
            />
            <div className="flex gap-2">
              <button className="border px-3 rounded" onClick={connect}>
                Connect
              </button>
              <a className="underline ml-2 self-center" href={`${conn.baseUrl}/__admin/docs/`} target="_blank">
                Docs
              </a>
            </div>
          </div>
          {msg && <div className="text-sm text-neutral-600">{msg}</div>}
        </section>

        <section className="bg-white rounded-2xl shadow p-4 grid gap-2">
          <h2 className="text-xl font-medium">Actions</h2>
          <div className="flex flex-wrap gap-2">
            <button className="border px-3 py-1 rounded" onClick={loadMappings} disabled={!client || loading}>
              Reload stubs
            </button>
            <button className="border px-3 py-1 rounded" onClick={createSample} disabled={!client}>
              Create sample stub
            </button>
            <button className="border px-3 py-1 rounded" onClick={reset} disabled={!client}>
              Reset
            </button>
            <button className="border px-3 py-1 rounded" onClick={persist} disabled={!client}>
              Persist
            </button>
            <button className="border px-3 py-1 rounded" onClick={countHello} disabled={!client}>
              Count GET /hello
            </button>
            <button className="border px-3 py-1 rounded" onClick={startRec} disabled={!client}>
              Start recording
            </button>
            <button className="border px-3 py-1 rounded" onClick={stopRec} disabled={!client}>
              Stop recording
            </button>
            <button className="border px-3 py-1 rounded" onClick={snapshot} disabled={!client}>
              Snapshot
            </button>
          </div>
          {count !== null && (
            <div className="text-sm">
              Count(GET /hello): <b>{count}</b>
            </div>
          )}
          {recording && (
            <pre className="bg-neutral-100 p-2 rounded text-xs overflow-auto">{JSON.stringify(recording, null, 2)}</pre>
          )}
        </section>

        <section className="bg-white rounded-2xl shadow p-4">
          <h2 className="text-xl font-medium mb-2">Stubs ({mappings.length})</h2>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="p-2">ID</th>
                  <th className="p-2">Method</th>
                  <th className="p-2">URL</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Scenario</th>
                  <th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((m: any) => (
                  <tr key={m.id || m.uuid} className="border-b hover:bg-neutral-50">
                    <td className="p-2 font-mono text-xs">{m.id || m.uuid}</td>
                    <td className="p-2">{m.request?.method}</td>
                    <td className="p-2 font-mono">{m.request?.url || m.request?.urlPath || m.request?.urlPattern}</td>
                    <td className="p-2">{m.response?.status}</td>
                    <td className="p-2">{m.scenarioName || '-'}</td>
                    <td className="p-2">
                      <button className="border px-2 py-0.5 rounded mr-2" onClick={() => deleteStub(m.id || m.uuid)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {mappings.length === 0 && (
                  <tr>
                    <td className="p-2 text-neutral-500" colSpan={6}>
                      No stubs
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

