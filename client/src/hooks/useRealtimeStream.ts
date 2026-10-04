import { useEffect, useState, useRef } from 'react';
import { getActorId, buildApiUrl } from '../api';

export interface StreamEvent {
  event: string;
  data: any;
}

export function useRealtimeStream(onEvent: (event: string, data: any) => void) {
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let reconnectTimeout: any = null;

    function connect() {
      const actorId = getActorId();
      const streamUrl = buildApiUrl(`/api/events/stream?actor_id=${encodeURIComponent(actorId)}`);
      const es = new EventSource(streamUrl);
      eventSourceRef.current = es;

      es.onopen = () => {
        setIsConnected(true);
      };

      const eventNames = [
        'CONNECTED',
        'DIRECTIVE_CREATED',
        'DIRECTIVE_UPDATED',
        'NOTE_ADDED',
        'PRESENCE_UPDATED',
        'SLA_BREACH_ALERT',
        'ALERT_DISPATCHED'
      ];

      eventNames.forEach(name => {
        es.addEventListener(name, (e: MessageEvent) => {
          try {
            const parsed = JSON.parse(e.data);
            onEvent(name, parsed);
          } catch (err) {
            console.error('Error parsing SSE event data:', err);
          }
        });
      });

      es.onerror = () => {
        setIsConnected(false);
        es.close();
        reconnectTimeout = setTimeout(connect, 4000);
      };
    }

    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [onEvent]);

  return { isConnected };
}
