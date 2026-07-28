export type ScheduledTask = {
  id: number;
  clear: () => void;
};

export interface RoomScheduler {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): ScheduledTask;
  clear(task: ScheduledTask | null): void;
}

export class DefaultRoomScheduler implements RoomScheduler {
  now() {
    return Date.now();
  }

  setTimeout(callback: () => void, delayMs: number): ScheduledTask {
    const timeout = globalThis.setTimeout(callback, Math.max(0, delayMs));
    return {
      id: Number(timeout),
      clear: () => globalThis.clearTimeout(timeout)
    };
  }

  clear(task: ScheduledTask | null) {
    task?.clear();
  }
}

export class ManualRoomScheduler implements RoomScheduler {
  private currentTime: number;
  private nextId = 1;
  readonly tasks: { id: number; dueAt: number; callback: () => void; active: boolean }[] = [];

  constructor(initialTime = 0) {
    this.currentTime = initialTime;
  }

  now() {
    return this.currentTime;
  }

  setTimeout(callback: () => void, delayMs: number): ScheduledTask {
    const task = {
      id: this.nextId,
      dueAt: this.currentTime + Math.max(0, delayMs),
      callback,
      active: true
    };
    this.nextId += 1;
    this.tasks.push(task);
    return {
      id: task.id,
      clear: () => {
        task.active = false;
      }
    };
  }

  clear(task: ScheduledTask | null) {
    task?.clear();
  }

  advanceBy(ms: number) {
    this.currentTime += ms;
    this.flushDueTasks();
  }

  flushDueTasks() {
    let due = this.tasks.find((task) => task.active && task.dueAt <= this.currentTime);
    while (due) {
      due.active = false;
      due.callback();
      due = this.tasks.find((task) => task.active && task.dueAt <= this.currentTime);
    }
  }

  activeTaskCount() {
    return this.tasks.filter((task) => task.active).length;
  }
}
