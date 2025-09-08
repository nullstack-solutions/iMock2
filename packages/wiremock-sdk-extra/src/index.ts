import { Configuration, DefaultApi } from 'wiremock-sdk';

export type ClientOptions = {
  baseUrl: string;
  user?: string;
  pass?: string;
};

export const createWiremockClient = (opts: ClientOptions) => {
  const cfg = new Configuration({
    basePath: opts.baseUrl.replace(/\/+$/, ''),
    headers:
      opts.user && opts.pass
        ? { Authorization: 'Basic ' + btoa(`${opts.user}:${opts.pass}`) }
        : undefined,
  });
  const api = new DefaultApi(cfg);

  return {
    // Mappings
    listMappings: (limit = 50, offset = 0) => api.getAdminMappings({ limit, offset } as any),
    createMapping: (body: any) => api.postAdminMappings({ stubMapping: body } as any),
    getMapping: (id: string) => api.getAdminMappingsId({ id } as any),
    updateMapping: (id: string, body: any) => api.putAdminMappingsId({ id, stubMapping: body } as any),
    deleteMapping: (id: string) => api.deleteAdminMappingsId({ id } as any),
    resetMappings: () => api.postAdminMappingsReset(),
    persistMappings: () => api.postAdminMappingsPersist(),
    importMappings: (payload: any) => api.postAdminMappingsImport({ mappingsImport: payload } as any),
    findByMetadata: (query: any) => api.postAdminMappingsFindByMetadata({ requestBody: query } as any),
    deleteByMetadata: (query: any) => api.postAdminMappingsDeleteByMetadata({ requestBody: query } as any),

    // Requests journal
    listRequests: () => api.getAdminRequests(),
    clearRequests: () => api.deleteAdminRequests(),
    findRequests: (query: any) => api.postAdminRequestsFind({ requestPattern: query } as any),
    countRequests: (query: any) => api.postAdminRequestsCount({ requestPattern: query } as any),
    removeRequestsByMetadata: (query: any) => api.postAdminRequestsRemoveByMetadata({ requestBody: query } as any),
    listUnmatched: () => api.getAdminRequestsUnmatched(),
    nearMisses: (req: any) => api.postAdminNearMissesRequest({ loggedRequest: req } as any),

    // Scenarios
    resetScenarios: () => api.postAdminScenariosReset(),
    setScenarioState: (name: string, state: string) =>
      api.putAdminScenariosNameState({ name, scenarioState: { state } as any } as any),

    // Recordings
    startRecording: (body: any) => api.postAdminRecordingsStart({ startRecordingSpec: body } as any),
    stopRecording: () => api.postAdminRecordingsStop(),
    recordingStatus: () => api.getAdminRecordingsStatus(),
    snapshot: (body?: any) => api.postAdminRecordingsSnapshot({ snapshotRecordSpec: body } as any),

    // Settings / System
    updateSettings: (body: any) => api.postAdminSettings({ globalSettings: body } as any),
    shutdown: () => api.postAdminShutdown(),

    // Files
    putFile: async (filename: string, data: Blob | ArrayBuffer | string) => {
      const url = cfg.basePath + `/__admin/files/${encodeURIComponent(filename)}`;
      await fetch(url, { method: 'PUT', body: data as any, headers: cfg.headers as any });
    },
    getFile: async (filename: string) => {
      const url = cfg.basePath + `/__admin/files/${encodeURIComponent(filename)}`;
      const r = await fetch(url, { headers: cfg.headers as any });
      return r.arrayBuffer();
    },
    deleteFile: async (filename: string) => {
      const url = cfg.basePath + `/__admin/files/${encodeURIComponent(filename)}`;
      await fetch(url, { method: 'DELETE', headers: cfg.headers as any });
    },
  };
};

export type WiremockClient = ReturnType<typeof createWiremockClient>;

