"""Execute production Lua in an embedded interpreter, never a Redis server.

Only redis.call is replaced with an in-memory command model. No network/listener.
Optional on systems without Python/liblua; the Node handler tests are portable.
"""
import ctypes
import ctypes.util
import json
import sys

name = ctypes.util.find_library('lua5.4') or ctypes.util.find_library('lua5.3')
if not name:
    print(json.dumps({'unavailable': True}))
    sys.exit(0)
lua = ctypes.CDLL(name)
lua.luaL_newstate.restype = ctypes.c_void_p
lua.luaL_openlibs.argtypes = [ctypes.c_void_p]
lua.luaL_loadstring.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
lua.lua_pcallk.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_longlong, ctypes.c_void_p]
lua.lua_tolstring.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.POINTER(ctypes.c_size_t)]
lua.lua_tolstring.restype = ctypes.c_void_p
lua.lua_settop.argtypes = [ctypes.c_void_p, ctypes.c_int]
lua.lua_close.argtypes = [ctypes.c_void_p]
state = lua.luaL_newstate()
lua.luaL_openlibs(state)

def evaluate(source):
    failed = lua.luaL_loadstring(state, source.encode()) or lua.lua_pcallk(state, 0, 1, 0, 0, None)
    length = ctypes.c_size_t()
    pointer = lua.lua_tolstring(state, -1, ctypes.byref(length))
    value = ctypes.string_at(pointer, length.value).decode() if pointer else ''
    lua.lua_settop(state, 0)
    if failed:
        raise RuntimeError(value)
    return value

evaluate('''
db={}; redis={call=function(command,key,...)
 local a={...}; local v=db[key]
 if command=='HGET' then return v and v[a[1]] or false end
 if command=='HSET' then v=v or {}; db[key]=v; for i=1,#a,2 do v[a[i]]=tostring(a[i+1]) end; return 1 end
 if command=='HINCRBY' then v=v or {}; db[key]=v; v[a[1]]=tostring((tonumber(v[a[1]]) or 0)+tonumber(a[2])); return tonumber(v[a[1]]) end
 if command=='GET' then return v or false end
 if command=='EXISTS' then return v and 1 or 0 end
 if command=='INCR' then db[key]=tostring((tonumber(v) or 0)+1); return tonumber(db[key]) end
 if command=='EXPIRE' then return 1 end
 if command=='ZADD' then v=v or {}; db[key]=v; v[a[2]]=tonumber(a[1]); return 1 end
 if command=='ZCARD' then local n=0; for _ in pairs(v or {}) do n=n+1 end; return n end
 if command=='ZREM' then if v then v[a[1]]=nil end; return 1 end
 if command=='ZREMRANGEBYSCORE' then
  local low=a[1]=='-inf' and -math.huge or tonumber(a[1]); local high=tonumber(a[2]);
  for member,score in pairs(v or {}) do if score>=low and score<=high then v[member]=nil end end; return 1
 end
 error('Unsupported test command: '..command)
end}; return 'OK'
''')
try:
    results = []
    for op in json.load(sys.stdin):
        keys = ','.join(json.dumps(str(s)) for s in op.get('keys', []))
        args = ','.join(json.dumps(str(s)) for s in op.get('args', []))
        results.append(evaluate('KEYS={' + keys + '}; ARGV={' + args + '}; return tostring((function() ' + op['script'] + '\nend)())'))
    print(json.dumps({'results': results}))
finally:
    lua.lua_close(state)
