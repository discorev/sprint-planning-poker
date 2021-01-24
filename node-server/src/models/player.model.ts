export class Player {
    name: String;
    choice: String = null;
    snoozed = false;

    constructor(name: String) {
        this.name = name;
    }
}