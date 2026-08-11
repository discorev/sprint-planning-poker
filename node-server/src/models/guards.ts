export interface Action {
    readonly action: string
}

interface RegisterAction extends Action {
    readonly action: 'register'
    readonly name: string
    readonly observer?: boolean
}

interface RecordChoiceAction extends Action {
    readonly action: 'record-choice'
    readonly choice?: string
}

interface SnoozeAction extends Action {
    readonly action: 'snooze'
    readonly player: string
}

interface ResetAction extends Action {
    readonly action: 'reset'
}

interface SetSubjectAction extends Action {
    readonly action: 'set-subject'
    readonly subject: string
}

export function isAction(value: unknown): value is Action {
    return isRecord(value) && typeof value.action === 'string'
}

export function isRegisterAction(action: Action): action is RegisterAction {
    return action.action === 'register'
        && isRecord(action)
        && typeof action.name === 'string'
        && (action.observer === undefined || typeof action.observer === 'boolean')
}

export function isRecordChoiceAction(action: Action): action is RecordChoiceAction {
    return action.action === 'record-choice'
        && isRecord(action)
        && (action.choice === undefined || typeof action.choice === 'string')
}

export function isSnoozeAction(action: Action): action is SnoozeAction {
    return action.action === 'snooze'
        && isRecord(action)
        && typeof action.player === 'string'
}

export function isResetAction(action: Action): action is ResetAction {
    return action.action === 'reset'
}

export function isSetSubjectAction(action: Action): action is SetSubjectAction {
    return action.action === 'set-subject'
        && isRecord(action)
        && typeof action.subject === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}
