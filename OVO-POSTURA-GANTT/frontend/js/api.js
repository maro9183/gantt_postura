/* global API */
window.API = (() => {
  const BASE = '/api';

  async function req(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    
    if (window.Auth && window.Auth.getToken()) {
      opts.headers['Authorization'] = 'Bearer ' + window.Auth.getToken();
    }
    
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(BASE + path, opts);
    const data = await res.json();
    
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        if (window.Auth) {
           if (res.status === 401) window.Auth.logout();
           else alert(data.error || 'Permisos insuficientes');
        }
      }
      throw data;
    }
    return data;
  }

  return {
    // Projects
    getProjects:       ()       => req('GET',    '/projects'),
    createProject:     (d)      => req('POST',   '/projects', d),
    updateProject:     (id, d)  => req('PUT',    `/projects/${id}`, d),
    deleteProject:     (id)     => req('DELETE', `/projects/${id}`),
    getProjectTasks:   (id)     => req('GET',    `/projects/${id}/tasks`),

    // Tasks
    getTasks:          ()       => req('GET',    '/tasks'),
    getTask:           (id)     => req('GET',    `/tasks/${id}`),
    getCompras:        ()       => req('GET',    '/tasks/compras/all'),
    createTask:        (d)      => req('POST',   '/tasks', d),
    updateTask:        (id, d)  => req('PUT',    `/tasks/${id}`, d),
    deleteTask:        (id)     => req('DELETE', `/tasks/${id}`),

    // Resources & Responsables
    getResources:      ()       => req('GET', '/resources'),
    createRecurso:     (d)      => req('POST', '/resources', d),
    updateRecurso:     (id, d)  => req('PUT', `/resources/${id}`, d),
    deleteRecurso:     (id)     => req('DELETE', `/resources/${id}`),
    getResponsables:   ()       => req('GET', '/responsables'),
    createResponsable: (d)      => req('POST', '/responsables', d),
    updateResponsable: (id, d)  => req('PUT', `/responsables/${id}`, d),
    deleteResponsable: (id)     => req('DELETE', `/responsables/${id}`),

    // Subresponsables (Teams)
    getSubresponsables: ()      => req('GET', '/subresponsables'),
    createSubresp:     (d)      => req('POST', '/subresponsables', d),
    updateSubresp:     (id, d)  => req('PUT', `/subresponsables/${id}`, d),
    deleteSubresp:     (id)     => req('DELETE', `/subresponsables/${id}`),

    // Notes
    getNotes:          (tid)    => req('GET',    `/tasks/${tid}/notes`),
    createNote:        (d)      => req('POST',   '/notes', d),
    deleteNote:        (nid)    => req('DELETE', `/notes/${nid}`),

    // Users
    getUsers:          ()       => req('GET',    '/users'),
    createUser:        (d)      => req('POST',   '/users', d),
    updateUser:        (id, d)  => req('PUT',    `/users/${id}`, d),
    deleteUser:        (id)     => req('DELETE', `/users/${id}`),
  };
})();
