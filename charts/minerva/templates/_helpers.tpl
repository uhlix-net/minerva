{{- define "minerva.name" -}}{{ .Chart.Name }}{{- end -}}

{{- define "minerva.fullname" -}}
{{- if contains .Chart.Name .Release.Name -}}{{ .Release.Name | trunc 50 | trimSuffix "-" }}
{{- else -}}{{ printf "%s-%s" .Release.Name .Chart.Name | trunc 50 | trimSuffix "-" }}{{- end -}}
{{- end -}}

{{- define "minerva.labels" -}}
app.kubernetes.io/name: {{ include "minerva.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}

{{- define "minerva.selector" -}}
app.kubernetes.io/name: {{ include "minerva.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "minerva.image" -}}{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}{{- end -}}

{{- define "minerva.host" -}}
{{- $u := required "baseUrl is required, e.g. --set baseUrl=https://wiki.example.com" .Values.baseUrl | urlParse -}}
{{- $u.host | splitList ":" | first -}}
{{- end -}}

{{- define "minerva.secret" -}}{{ include "minerva.fullname" . }}-app{{- end -}}

{{/* Environment shared by the app and the preflight Job. */}}
{{- define "minerva.commonEnv" -}}
- name: MINERVA_BASE_URL
  value: {{ .Values.baseUrl | trimSuffix "/" | quote }}
- name: MINERVA_SITE_NAME
  value: {{ .Values.siteName | quote }}
- name: MINERVA_MODULES
  value: {{ join "," .Values.modules | quote }}
{{- if .Values.smtp.host }}
- name: SMTP_HOST
  value: {{ .Values.smtp.host | quote }}
- name: SMTP_PORT
  value: {{ .Values.smtp.port | quote }}
{{- end }}
{{- if .Values.extraCA.configMap }}
- name: NODE_EXTRA_CA_CERTS
  value: /etc/minerva-ca/{{ .Values.extraCA.key }}
{{- end }}
{{- with .Values.oidc }}{{ if .enabled }}
- name: OIDC_ISSUER
  value: {{ required "oidc.issuer is required when oidc.enabled" .issuer | quote }}
- name: OIDC_DISPLAY_NAME
  value: {{ .displayName | quote }}
- name: OIDC_SCOPES
  value: {{ .scopes | quote }}
- name: OIDC_USERNAME_CLAIM
  value: {{ .usernameClaim | quote }}
- name: OIDC_GROUPS_CLAIM
  value: {{ .groupsClaim | quote }}
- name: OIDC_ADMIN_GROUPS
  value: {{ join "," .adminGroups | quote }}
- name: OIDC_ALLOWED_GROUPS
  value: {{ join "," .allowedGroups | quote }}
- name: OIDC_CLIENT_ID
  valueFrom: {secretKeyRef: {name: {{ required "oidc.existingSecret is required" .existingSecret }}, key: client-id}}
- name: OIDC_CLIENT_SECRET
  valueFrom: {secretKeyRef: {name: {{ .existingSecret }}, key: client-secret}}
{{- end }}{{ end }}
{{- with .Values.ldap }}{{ if .enabled }}
- name: LDAP_URL
  value: {{ required "ldap.url is required when ldap.enabled" .url | quote }}
- name: LDAP_BIND_DN
  value: {{ .bindDn | quote }}
- name: LDAP_USER_BASE
  value: {{ required "ldap.userBase is required" .userBase | quote }}
- name: LDAP_USER_FILTER
  value: {{ .userFilter | quote }}
- name: LDAP_ADMIN_GROUPS
  value: {{ join "," .adminGroups | quote }}
- name: LDAP_ALLOWED_GROUPS
  value: {{ join "," .allowedGroups | quote }}
- name: LDAP_DISPLAY_NAME
  value: {{ .displayName | quote }}
- name: LDAP_BIND_PASSWORD
  valueFrom: {secretKeyRef: {name: {{ required "ldap.existingSecret is required" .existingSecret }}, key: bind-password}}
{{- end }}{{ end }}
{{- end -}}

{{- define "minerva.caVolume" -}}
{{- if .Values.extraCA.configMap }}
- name: extra-ca
  configMap: {name: {{ .Values.extraCA.configMap }}}
{{- end }}
{{- end -}}
{{- define "minerva.caMount" -}}
{{- if .Values.extraCA.configMap }}
- name: extra-ca
  mountPath: /etc/minerva-ca
  readOnly: true
{{- end }}
{{- end -}}
