// Test-only lobby readiness gate.
// Every real non-Host player must be ready before startTestGame is allowed.
// If Host is the only real player, starting with Bots is allowed.
const { Server } = require('socket.io');

const realSockets = new Map();
const originalServerOn = Server.prototype.on;

Server.prototype.on = function(eventName, listener){
  if(eventName !== 'connection' || typeof listener !== 'function'){
    return originalServerOn.call(this, eventName, listener);
  }

  return originalServerOn.call(this, eventName, function(socket){
    const baseOn = socket.on.bind(socket);

    socket.on = function(name, handler){
      if(typeof handler !== 'function') return baseOn(name, handler);

      if(name === 'joinRoom'){
        return baseOn(name, function(data){
          const result = handler.apply(this, arguments);
          setImmediate(()=>{
            if(socket.data?.playerId){
              realSockets.set(socket.id, { joined:true, ready:false });
            }
          });
          return result;
        });
      }

      if(name === 'setReady'){
        return baseOn(name, function(data){
          const result = handler.apply(this, arguments);
          setImmediate(()=>{
            const state = realSockets.get(socket.id) || { joined:!!socket.data?.playerId, ready:false };
            state.joined = !!socket.data?.playerId;
            state.ready = data?.ready === true;
            realSockets.set(socket.id, state);
          });
          return result;
        });
      }

      if(name === 'startTestGame'){
        return baseOn(name, function(data){
          const waiting = [...realSockets.entries()].filter(([id,state]) =>
            id !== socket.id && state?.joined === true && state?.ready !== true
          );
          if(waiting.length){
            socket.emit('actionError', {
              message: 'Còn ' + waiting.length + ' người chơi thật chưa sẵn sàng.'
            });
            return;
          }
          return handler.apply(this, arguments);
        });
      }

      if(name === 'stopTestGame'){
        return baseOn(name, function(){
          const result = handler.apply(this, arguments);
          setImmediate(()=>{
            for(const state of realSockets.values()) state.ready = false;
          });
          return result;
        });
      }

      if(name === 'leaveRoom'){
        return baseOn(name, function(){
          const result = handler.apply(this, arguments);
          setImmediate(()=>realSockets.delete(socket.id));
          return result;
        });
      }

      if(name === 'disconnect'){
        return baseOn(name, function(){
          realSockets.delete(socket.id);
          return handler.apply(this, arguments);
        });
      }

      return baseOn(name, handler);
    };

    return listener(socket);
  });
};

console.log('[TEST READY] gate enabled: all real non-Host players must be ready; solo Host may start with Bots.');
