export class Player {
    name: String;
    choice: String = null;
    snoozed = false;
    observer: boolean;

    constructor(name: String, observer = false) {
        this.name = name;
        this.observer = observer;
    }
}