interface Action {
    action: string
}

export function isAction(object: unknown): object is Action {
    return typeof object === 'object' && object !== null && Object.hasOwn(object, 'action')
}

interface RegisterAction extends Action {
    name: string
    observer?: boolean
}

export function isRegisterAction(action: Action): action is RegisterAction {
    return action.action === "register" && Object.hasOwn(action, 'name')
}

interface RecordChoiceAction extends Action {
    choice?: string
}

export function isRecordChoiceAction(action: Action): action is RecordChoiceAction {
    return action.action === "record-choice"
}

interface SnoozeAction extends Action {
    player: string
}

export function isSnoozeAction(action: Action): action is SnoozeAction {
    return action.action === "snooze" && Object.hasOwn(action, 'player')
}