import { provide, inject } from 'vue';

const KEY = Symbol('ommrExplorer');

/** Make the explorer's shared state available to the screens below the view. */
export function provideOmmrContext(explorer) {
    provide(KEY, explorer);
    return explorer;
}

/** The explorer's shared state (see useOmmrExplorer.js). Only valid inside the explorer view. */
export function useOmmrContext() {
    const explorer = inject(KEY, null);
    if (!explorer) throw new Error('useOmmrContext() must be used inside the OMMR explorer view.');
    return explorer;
}
