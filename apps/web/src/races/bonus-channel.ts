import type { BonusClient, BonusTransport } from "./bonus-client";
import type { RaceClient } from "./race-client";

/** One socket's lifetime. Race and bonus revisions deliberately remain separate. */
export class BonusChannel {
  readonly #unsubscribe: () => void;
  #connected = false;
  #identity = "";
  #context = "";

  constructor(readonly race: RaceClient, readonly bonuses: BonusClient, readonly transport: BonusTransport) {
    this.#unsubscribe = race.subscribe(() => this.#sync());
    this.#sync();
  }

  connect(): void {
    this.#connected = true;
    this.bonuses.connect(this.transport);
    this.#sync();
  }

  disconnect(): void {
    this.#connected = false;
    this.bonuses.disconnect();
  }

  close(): void {
    this.#unsubscribe();
    this.disconnect();
    // Cancel fog timers too, without permanently disposing the controller reused by React.
    this.bonuses.begin({ raceId: "", entrantId: null });
  }

  #sync(): void {
    const state = this.race.getState();
    const identity = JSON.stringify([state.reveal?.raceId, state.selfEntrantId]);
    if (identity !== this.#identity) {
      this.#identity = identity;
      this.#context = "";
      this.bonuses.begin({ raceId: state.reveal?.raceId ?? "", entrantId: state.selfEntrantId });
      if (this.#connected) this.bonuses.connect(this.transport);
    }
    const controlling = state.control === "controlling" && state.block === undefined;
    const racing = state.progress?.phase === "racing" && state.typing?.status === "racing" && !state.confirming;
    const context = `${controlling}:${racing}`;
    if (context !== this.#context) {
      this.#context = context;
      this.bonuses.context({ controlling, racing });
    }
    this.bonuses.clockChanged();
  }
}
