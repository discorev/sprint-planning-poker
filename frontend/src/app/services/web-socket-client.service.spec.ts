import { TestBed } from '@angular/core/testing';

import { WebSocketClientService } from './web-socket-client.service';

describe('WebSocketClientService', () => {
  let service: WebSocketClientService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WebSocketClientService);
  });

  afterEach(() => {
    service.ngOnDestroy();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should return a WebSocketSubject when connect is called', () => {
    const webSocketSubject = service.connect('ws:localhost');
    expect(webSocketSubject).toBeTruthy();
  });
});
