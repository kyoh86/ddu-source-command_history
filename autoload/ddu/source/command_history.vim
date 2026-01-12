function ddu#source#command_history#parse_cmd(cmdline)
  if exists('*nvim_parse_cmd')
    try
      return nvim_parse_cmd(a:cmdline, {}) " able to parse
    catch
      return v:null
    endtry
  endif
  return v:null
endfunction
