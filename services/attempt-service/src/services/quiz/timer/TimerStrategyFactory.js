import { NoTimerStrategy } from './NoTimerStrategy.js';
import { StrictTimerStrategy } from './StrictTimerStrategy.js';
import { SoftTimerStrategy } from './SoftTimerStrategy.js';

/**
 * TimerStrategyFactory (SOLID: Single Responsibility & Open/Closed Principle)
 * Resolves the appropriate timer strategy for any given quiz attempt.
 */
class TimerStrategyFactoryImpl {
  constructor() {
    this.strategies = new Map([
      ['none', new NoTimerStrategy()],
      ['strict', new StrictTimerStrategy()],
      ['soft', new SoftTimerStrategy()],
    ]);
  }

  /**
   * Register a new timer strategy.
   * @param {string} mode
   * @param {BaseTimerStrategy} strategy
   */
  register(mode, strategy) {
    this.strategies.set(String(mode).toLowerCase(), strategy);
  }

  /**
   * Resolve timer strategy by timerMode string.
   * @param {string} mode
   * @returns {BaseTimerStrategy}
   */
  getStrategy(mode) {
    const key = String(mode || 'none').toLowerCase();
    return this.strategies.get(key) || this.strategies.get('none');
  }
}

export const TimerStrategyFactory = new TimerStrategyFactoryImpl();
export default TimerStrategyFactory;
