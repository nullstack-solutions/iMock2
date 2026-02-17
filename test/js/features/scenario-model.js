'use strict';

(function initialiseScenarioModel() {
    if (window.ScenarioModel) {
        return;
    }

    const safeDecode = (value) => {
        if (typeof value !== 'string') return '';
        const trimmed = value.trim();
        if (!trimmed) return '';

        if (!/%[0-9a-fA-F]{2}/.test(trimmed)) {
            return trimmed;
        }

        try {
            return decodeURIComponent(trimmed);
        } catch (e) {
            Logger.warn('SCENARIOS', 'safeDecode failed, returning original value', { value, error: e });
            return trimmed;
        }
    };

    const normalizeScenarioLink = (link) => {
        if (typeof link !== 'string') return '';
        let value = link.trim();
        if (!value) return '';

        if (/^https?:\/\//i.test(value)) {
            try {
                const url = new URL(value);
                value = url.pathname;
            } catch (e) {
                Logger.warn('SCENARIOS', 'normalizeScenarioLink failed to parse absolute URL', { link, error: e });
            }
        }

        const adminPrefix = '/__admin';
        if (value.startsWith(adminPrefix)) {
            value = value.slice(adminPrefix.length) || '/';
        }

        value = value.replace(/^\/+/, '');
        return value ? `/${value}` : '';
    };

    const normalizeScenario = (scenario, index) => {
        if (!scenario || typeof scenario !== 'object') return null;

        const rawId = typeof scenario.id === 'string' ? scenario.id : '';
        const rawName = typeof scenario.name === 'string' ? scenario.name : '';

        const decodedId = safeDecode(rawId);
        const decodedName = safeDecode(rawName);

        const identifier = decodedId || decodedName || rawId || rawName || '';
        const displayName = decodedName || decodedId || rawName || rawId || `Scenario ${index + 1}`;

        const normalizedState = safeDecode(scenario.state) || scenario.state || 'Started';
        const normalizedStates = Array.isArray(scenario.possibleStates)
            ? scenario.possibleStates.map((state) => safeDecode(state) || state).filter(Boolean)
            : [];

        const normalizedMappings = Array.isArray(scenario.mappings)
            ? scenario.mappings.map((mapping) => {
                if (!mapping || typeof mapping !== 'object') return mapping;
                return {
                    ...mapping,
                    requiredScenarioState: safeDecode(mapping.requiredScenarioState) || mapping.requiredScenarioState || '',
                    newScenarioState: safeDecode(mapping.newScenarioState) || mapping.newScenarioState || ''
                };
            })
            : [];

        const explicitStateEndpoint = normalizeScenarioLink(
            scenario.stateEndpoint ||
            scenario?._links?.['update-state']?.href ||
            scenario?._links?.updateState?.href ||
            scenario?._links?.state?.href
        );

        const explicitResetEndpoint = normalizeScenarioLink(
            scenario.resetEndpoint ||
            scenario?._links?.['reset-state']?.href ||
            scenario?._links?.resetState?.href ||
            scenario?._links?.reset?.href
        );

        return {
            ...scenario,
            id: identifier || decodedId || rawId,
            name: displayName,
            displayName,
            identifier,
            originalId: rawId,
            originalName: rawName || decodedName,
            decodedId,
            decodedName,
            state: normalizedState,
            possibleStates: normalizedStates,
            mappings: normalizedMappings,
            stateEndpoint: explicitStateEndpoint,
            resetEndpoint: explicitResetEndpoint
        };
    };

    const normalizeScenarioList = (list) => {
        if (!Array.isArray(list)) return [];
        return list
            .map((scenario, index) => normalizeScenario(scenario, index))
            .filter(Boolean);
    };

    const normalizeSearchTerm = (value) => {
        if (typeof value !== 'string') return '';
        return value.trim().toLowerCase();
    };

    const scenarioMatchesSearch = (scenario, term) => {
        if (!term) return true;
        if (!scenario || typeof scenario !== 'object') return false;

        const haystacks = [
            scenario.displayName,
            scenario.name,
            scenario.identifier,
            scenario.id,
            scenario.state,
            scenario.description
        ]
            .filter((value) => typeof value === 'string' && value.trim())
            .map((value) => value.toLowerCase());

        if (haystacks.some((value) => value.includes(term))) {
            return true;
        }

        const mappings = Array.isArray(scenario.mappings) ? scenario.mappings : [];
        return mappings.some((mapping) => {
            if (!mapping || typeof mapping !== 'object') return false;
            const mappingValues = [
                mapping.name,
                mapping.id,
                mapping.uuid,
                mapping.stubId,
                mapping.stubMappingId,
                mapping.requiredScenarioState,
                mapping.newScenarioState,
                mapping.request?.method,
                mapping.request?.url,
                mapping.request?.urlPattern,
                mapping.request?.urlPath,
                mapping.request?.urlPathPattern
            ]
                .filter((value) => typeof value === 'string' && value.trim())
                .map((value) => value.toLowerCase());
            return mappingValues.some((value) => value.includes(term));
        });
    };

    window.ScenarioModel = {
        safeDecode,
        normalizeScenarioLink,
        normalizeScenario,
        normalizeScenarioList,
        normalizeSearchTerm,
        scenarioMatchesSearch,
    };
})();
